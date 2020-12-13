import '@aws-cdk/assert/jest';
import { Stack } from '@aws-cdk/core';
import { CodeDeployOnPremises } from '../lib/codedeploy-on-premises';

test('Should have CodeDeploy resources with no slackWebhookURL', () => {
  const stack = new Stack(undefined, undefined, {
    env: { region: 'ap-northeast-1' },
  });

  new CodeDeployOnPremises(stack, 'TestCodeDeployOnPremises', {
    projectName: 'resume-clinic-test',
      projectStage: 'testing',
      deploymentGroups: [
        {
          name: 'Master',
          instances: [
            {
              name: 'test01',
            }
          ]
        }
      ],
  });

  expect(stack).toHaveResource('AWS::S3::Bucket');
  expect(stack).toHaveResource('AWS::IAM::User');
  expect(stack).toHaveResource('AWS::IAM::Role');
  expect(stack).toHaveResource('AWS::CodeDeploy::Application');
  expect(stack).toHaveResource('AWS::CodeDeploy::DeploymentGroup');
});

test('Should have CodeDeploy resources with slackWebhookURL', () => {
  const stack = new Stack(undefined, undefined, {
    env: { region: 'ap-northeast-1' },
  });

  new CodeDeployOnPremises(stack, 'TestCodeDeployOnPremises', {
    projectName: 'resume-clinic-test',
      projectStage: 'testing',
      deploymentGroups: [
        {
          name: 'Master',
          instances: [
            {
              name: 'test01',
            }
          ]
        }
      ],
      slackWebhookURL: 'https://hooks.slack.com/services/{your-slack-token}',
  });

  expect(stack).toHaveResource('AWS::S3::Bucket');
  expect(stack).toHaveResource('AWS::IAM::User');
  expect(stack).toHaveResource('AWS::IAM::Role');
  expect(stack).toHaveResource('AWS::CodeDeploy::Application');
  expect(stack).toHaveResource('AWS::CodeDeploy::DeploymentGroup');
  expect(stack).toHaveResource('AWS::SNS::Topic');
  expect(stack).toHaveResource('AWS::Lambda::Function');
});