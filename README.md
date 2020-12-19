[![Build Status](https://travis-ci.com/104corp/cdk-aws-codedeploy-on-premises.svg?branch=master)](https://travis-ci.com/104corp/cdk-aws-codedeploy-on-premises)

# cdk-aws-codedeploy-on-premises

CDK Construct for AWS CodeDeploy on premises

## Usage

Example

```typescript
new CodeDeployOnPremises(this, 'CodeDeployOnPremises', {
  projectName: 'Example Project',
  projectStage: 'production',
  deploymentGroups: [
    {
      name: 'Master',
      instances: [
        name: 'instance01',
        name: 'instance02',
      ],
    },
    {
      name: 'Slave',
      instances: [
        name: 'instance01',
        name: 'instance02',
      ],
    }
  ],
});
```

## Construct Props

| Name                  | Type               | Description                                                                        |
| :-------------------- | :----------------- | :--------------------------------------------------------------------------------- |
| projectName           | string             | The name of the project.                                                           |
| projectStage          | string             | The name of the stage. It's naming dev, staging, and production typically.         |
| deploymentGroups      | DeploymentGroups[] | Specify name for CodeDeploy deployment groups and instances                        |
| slackWebhookURL?      | string             | slack web hook url                                                                 |
| autoRegisterInstance? | boolean            | Using `AWSUtility::CloudFormation::CommandRunner` to register instance on premises |

### projectName

- Determines a part of the instance name. It look like `${projectName}-${projectStage}-${instanceName}`.
- Determines a part of AWS IAM user name for Travis CI. It look like `TravisCIUser-${projectName}-${projectStage}`
- Determines a part of CodeDeploy application name. It look like `${projectName}-${projectStage}`
- Determines a part of AWS IAM role name for CommandRunner. It look like `${projectName}-${projectStage}-EC2RunCommandRole`

### projectStage

I's the same with projectName property.

### deploymentGroups

The format is in example code. See `Usage` section.

### slackWebhookURL?

Notify message of status to slack channel.
Trigger deployment event is list below

- DeploymentStart
- DeploymentSuccess
- DeploymentFailure

### autoRegisterInstance?

Default is true.

AWS CodeDeploy on premises need to register for each instance. It can register by AWS CLI or API.

If use AWS CLI, it look like `aws deploy register --instance-name ${instanceName} --iam-user-arn ${user.userArn} --tags Key=Name,Value=${instanceName} --region ${Aws.REGION}`.

The Construct execute the command on EC2 which using `AWSUtility::CloudFormation::CommandRunner` CloudFormation resource type.

See more details

- [Running bash commands in AWS CloudFormation templates](https://aws.amazon.com/tw/blogs/mt/running-bash-commands-in-aws-cloudformation-templates/)
- [AWSUtility::CloudFormation::CommandRunner](https://github.com/aws-cloudformation/aws-cloudformation-resource-providers-awsutilities-commandrunner)

## IAM User Generation

- TravisCIUser-${projectName}-${projectStage}

The construct will generate the IAM user for Travis CI. Using the credential of IAM user to set on .travis.yml file.

See more details on [Travis CI setting for AWS CodeDeploy](https://docs.travis-ci.com/user/deployment/codedeploy/)

- CodeDeployUser-OnPrem-${groupName}-${instanceName}

The construct will generate the IAM user for CodeDeploy agent.

See more details on [Step 4: Add a configuration file to the on-premises instance](https://docs.aws.amazon.com/codedeploy/latest/userguide/register-on-premises-instance-iam-user-arn.html)
