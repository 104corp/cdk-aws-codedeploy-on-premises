import * as codedeploy from '@aws-cdk/aws-codedeploy';
import { CfnDeploymentGroup } from '@aws-cdk/aws-codedeploy';
import * as iam from '@aws-cdk/aws-iam';
import { ManagedPolicy } from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import * as sns from '@aws-cdk/aws-sns';
import * as subscriptions from '@aws-cdk/aws-sns-subscriptions';
import * as cfn_inc from '@aws-cdk/cloudformation-include';
import * as cdk from '@aws-cdk/core';
import { Aws, CfnOutput, CfnResource, Tags } from '@aws-cdk/core';
import * as path from 'path';

export interface DeploymentGroups {
  name: string;
  instances: DeploymentInstance[];
}

export interface DeploymentInstance {
  name: string;
}

export interface CodeDeployOnPremisesProps {
  /**
   * The projectName is used to define CodeDeploy application name, CodeDeployUser name and TravisCIUser name
   */
  readonly projectName: string;

  /**
   * The projectName is used to define CodeDeploy application name, CodeDeployUser name and TravisCIUser name
   */
  readonly projectStage: string;

  /**
   * Define DeploymentGroup name and instance name
   */
  readonly deploymentGroups: DeploymentGroups[];

  /**
   * Slack notification by DeploymentGroups triggerEvents
   */
  readonly slackWebhookURL?: string;

  /**
   * Define CDK-StackOwner Tag name
   */
  readonly owner?: string;

  /**
   * Automatic register instance on premises
   * It's base on AWS CloudFormation templates
   * Reference https://github.com/aws-cloudformation/aws-cloudformation-resource-providers-awsutilities-commandrunner/tree/master/docs#role
   */
  readonly autoRegisterInstance?: boolean;
}

export class CodeDeployOnPremises extends cdk.Construct {
  private readonly projectName: string;
  private readonly projectStage: string;
  private readonly owner: string;
  private commands = 'set -xe';

  constructor(
    scope: cdk.Construct,
    id: string,
    props: CodeDeployOnPremisesProps
  ) {
    super(scope, id);

    // Required
    this.projectName = props.projectName;
    this.projectStage = props.projectStage;

    this.owner = props?.owner || 'Unknown';
    const onPremGroups: DeploymentGroups[] = props?.deploymentGroups || [];
    const slackWebhookURL: string | undefined = props?.slackWebhookURL;

    const deploymentBucket = this.createDeploymentBucket();

    this.createTravisCIUser(deploymentBucket);
    const codeDeployRole = this.createCodeDeployRole();

    let deploymentEventTopic: sns.Topic | undefined = undefined;
    if (slackWebhookURL) {
      deploymentEventTopic = this.createDeploymentEventTopic();
      this.createDeploymentEventSubscription(
        deploymentEventTopic,
        slackWebhookURL
      );
    }

    const application = this.createCodeDeployApplication();

    let lastDeploymentGroup: CfnDeploymentGroup | undefined = undefined;
    // Create CodeDeployUsers and DeploymentGroups
    onPremGroups.forEach((onPremGroup: DeploymentGroups) => {
      const instanceNames: string[] = [];

      onPremGroup.instances.forEach((instance: DeploymentInstance) => {
        const instanceName = `${this.projectName}-${this.projectStage}-${instance.name}`;
        // Add to instanceTags objects
        instanceNames.push(instanceName);

        this.createCodeDeployUser(
          onPremGroup.name,
          instanceName,
          deploymentBucket
        );
      });

      lastDeploymentGroup = this.createDeploymentGroup(
        onPremGroup.name,
        application.applicationName,
        codeDeployRole.roleArn,
        instanceNames,
        deploymentEventTopic?.topicArn
      );
    });

    if (props?.autoRegisterInstance === undefined || props?.autoRegisterInstance) {
      const commandRunner = this.addCommandRunner();
      if (lastDeploymentGroup) {
        commandRunner.addDependsOn(lastDeploymentGroup);
      }
    }
  }

  createDeploymentBucket(): s3.Bucket {
    const bucket = new s3.Bucket(this, 'DeploymentBucket');
    this.tagResource(bucket);
    new CfnOutput(this, 'DeploymentBucketName', { value: bucket.bucketName });

    return bucket;
  }

  createTravisCIUser(deploymentBucket: s3.Bucket): iam.User {
    const user = new iam.User(this, 'TravisCIUser', {
      userName: `TravisCIUser-${this.projectName}-${this.projectStage}`,
    });
    // IAM user for Travis CI: grant permission
    user.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName('AWSCodeDeployDeployerAccess')
    );
    deploymentBucket.grantReadWrite(user);
    this.tagResource(user);
    new CfnOutput(this, 'TravisCIUser-UserName', { value: user.userName });

    return user;
  }

  createCodeDeployUser(
    groupName: string,
    instanceName: string,
    deploymentBucket: s3.Bucket
  ): void {
    const user = new iam.User(
      this,
      `CodeDeployUser-OnPrem-${groupName}-${instanceName}`,
      {
        userName: `CodeDeployUser-OnPrem-${groupName}-${instanceName}`,
      }
    );
    deploymentBucket.grantRead(user);
    this.tagResource(user);

    // Add outputs
    new CfnOutput(this, `CodeDeployUser-OnPrem-UserName-${instanceName}`, {
      value: user.userName,
    });
    new CfnOutput(this, `CodeDeployUser-OnPrem-Arn-${instanceName}`, {
      value: user.userArn,
    });
    new CfnOutput(this, `Register-OnPrem-Cli-${instanceName}`, {
      value: `aws deploy register --instance-name ${instanceName} --iam-user-arn ${user.userArn} --tags Key=Name,Value=${instanceName} --region ${Aws.REGION}`,
    });
  
    this.commands += ` && aws deploy register --instance-name ${instanceName} --iam-user-arn ${user.userArn} --tags Key=Name,Value=${instanceName} --region ${Aws.REGION} > /command-output.txt`;
  }

  createCodeDeployRole(): iam.Role {
    const role = new iam.Role(this, 'CodeDeployRole-OnPrem', {
      assumedBy: new iam.ServicePrincipal(
        `codedeploy.${cdk.Aws.REGION}.amazonaws.com`
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSCodeDeployRole'
        ),
      ],
    });
    this.tagResource(role);
    new CfnOutput(this, 'CodeDeployRole', { value: role.roleName });

    return role;
  }

  createCodeDeployApplication(): codedeploy.ServerApplication {
    const application = new codedeploy.ServerApplication(
      this,
      'CodeDeployApplication',
      {
        applicationName: `${this.projectName}-${this.projectStage}`,
      }
    );
    this.tagResource(application);
    new CfnOutput(this, 'ApplicationName', {
      value: application.applicationName,
    });

    return application;
  }

  createDeploymentGroup(
    groupName: string,
    applicationName: string,
    codeDeployRoleArn: string,
    instances: string[],
    deploymentEventTopicArn: string | undefined
  ): CfnDeploymentGroup {
    const deploymentGroup = new codedeploy.CfnDeploymentGroup(
      this,
      `CodeDeployDeploymentGroup-${groupName}`,
      {
        applicationName: applicationName,
        serviceRoleArn: codeDeployRoleArn,
        autoRollbackConfiguration: {
          enabled: false,
        },
        deploymentConfigName:
          codedeploy.ServerDeploymentConfig.ONE_AT_A_TIME.deploymentConfigName,
        deploymentGroupName: groupName,
        onPremisesInstanceTagFilters: instances.map((name: string) => {
          return {
            key: 'Name',
            value: name,
            type: 'KEY_AND_VALUE',
          };
        }),
        triggerConfigurations: deploymentEventTopicArn
          ? [
              {
                triggerEvents: [
                  'DeploymentStart',
                  'DeploymentSuccess',
                  'DeploymentFailure',
                ],
                triggerName: 'deploy-status',
                triggerTargetArn: deploymentEventTopicArn,
              },
            ]
          : undefined,
      }
    );
    this.tagResource(deploymentGroup);

    new CfnOutput(this, `CodeDeployDeploymentGroupName-${groupName}`, {
      value: deploymentGroup.deploymentGroupName as string,
    });

    return deploymentGroup;
  }

  createDeploymentEventTopic(): sns.Topic {
    const topic = new sns.Topic(this, 'CodeDeployDeploymentEventTopic');
    this.tagResource(topic);
    return topic;
  }

  createDeploymentEventSubscription(
    topic: sns.Topic,
    slackWebhookURL: string
  ): void {
    const subscription = new lambda.Function(
      this,
      'CodeDeployDeploymentEventSubscriptionLambda',
      {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset(path.join(__dirname, '../resources')),
        handler: 'deploymentEventSubscriptionLambda.handler',
        environment: {
          STAGE: this.projectStage,
          SLACK_WEBHOOK_URL: slackWebhookURL,
        },
      }
    );
    topic.addSubscription(new subscriptions.LambdaSubscription(subscription));
    this.tagResource(subscription);
  }

  tagResource(scope: cdk.Construct): void {
    // ref: https://github.com/aws/aws-cdk/issues/4134
    Tags.of(scope).add('CDK-StackOwner', this.owner);
    Tags.of(scope).add('CDK-CfnStackId', Aws.STACK_ID);
    Tags.of(scope).add('CDK-CfnStackName', Aws.STACK_NAME);
  }

  addCommandRunner(): CfnResource {
    const runCommandRole = this.createRunCommandRole();

    const template = new cfn_inc.CfnInclude(this, 'AddCommandRunner', {
      templateFile: `${__dirname}/../template/command-runner.yml`,
      preserveLogicalIds: false,
      parameters: {
        CommandRole: runCommandRole.roleName,
        Command: this.commands,
      }
    });

    return template.getResource('Command') as CfnResource;
  }

  createRunCommandRole(): iam.Role {
    const runCommandRole = new iam.Role(this, 'EC2RunCommandRole', {
      roleName: `${this.projectName}-${this.projectStage}-EC2RunCommandRole`,
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      inlinePolicies: {
        'EC2RunCommandRole': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['codedeploy:RegisterOnPremisesInstance', 'codedeploy:DeregisterOnPremisesInstance'],
              resources: [
                `arn:aws:codedeploy:::instance:${this.projectName}-${this.projectStage}-*`,
              ],
            }),
          ],
        }),
      },
    });

    new iam.CfnInstanceProfile(this, 'EC2RunCommandRoleInstanceProfile', {
      roles: [runCommandRole.roleName],
      instanceProfileName: `${this.projectName}-${this.projectStage}-EC2RunCommandRole`,
    });

    return runCommandRole;
  }
}
