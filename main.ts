import { AwsProvider } from '@cdktf/provider-aws';
import { DynamodbTable } from '@cdktf/provider-aws/lib/dynamodb';
import { IamRole } from '@cdktf/provider-aws/lib/iam';
import { LambdaFunction, LambdaPermission } from '@cdktf/provider-aws/lib/lambdafunction';
import { Construct } from 'constructs';
import { App, TerraformOutput, TerraformStack } from 'cdktf';
import * as path from 'path';
import { NodejsFunction } from './lib/nodejs-function';


interface AlexaSkillOptions {
  /** The Alexa skill ID; looks like amzn1.ask.skill.xxxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx */
  skillId: string;
  /** Whether this is a production or development build */
  environment: 'development' | 'production';
  /** Optional name of a developer who wants to set up their own development version of the skill */
  developerName?: string;
}

class AlexaSkillStack extends TerraformStack {
  constructor(scope: Construct, name: string, public options: AlexaSkillOptions) {
    super(scope, name);

    const suffix = options.developerName ? `-${options.developerName.toLowerCase().replace(/\s/g, '')}-dev` : '';

    // Uncomment this to use a remote backend to store Terraform state
    // new RemoteBackend(this, {
    //   hostname: 'app.terraform.io',
    //   organization: 'my-company',
    //   workspaces: {
    //     name: `cdktf-integration-alexa${suffix}`,
    //   },
    // });

    // Get the code that will be running inside the Lambda function
    const code = new NodejsFunction(this, 'code', {
      path: path.join(__dirname, 'lambda/index.ts'),
    });

    // Initialize the prebuilt AWS Provider
    new AwsProvider(this, 'provider', {
      region: 'us-east-1',
    });

    // Create DynamoDB table
    const table = new DynamodbTable(this, 'database', {
      name: `cdktf-integration-alexa${suffix}`,
      hashKey: 'id',
      attribute: [{ name: 'id', type: 'S' }],
      billingMode: 'PROVISIONED',
      readCapacity: options.environment === 'production' ? 30 : 5, // adjust as needed
      writeCapacity: options.environment === 'production' ? 30 : 5, // adjust as needed
      tags: {
        environment: options.environment,
      },
    });
    // If using more than one DynamoDB table, insert others here

    // Create Lambda role
    const role = new IamRole(this, 'lambda-exec', {
      name: `cdktf-integration-alexa${suffix}`,
      assumeRolePolicy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Principal: {
              Service: 'lambda.amazonaws.com',
            },
            Effect: 'Allow',
          },
        ],
      }),
      inlinePolicy: [
        {
          name: 'alexaSkillExecutionPolicy',
          policy: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Action: [
                  'logs:*',
                  'dynamodb:*',
                  'xray:PutTraceSegments',
                  'xray:PutTelemetryRecords'
                ],
                Resource: '*', // Idk if this is a good idea but that's what the Alexa CF template does
                Effect: 'Allow',
              },
            ],
          }),
        },
      ],
    });

    // Create Lambda function
    const lambda = new LambdaFunction(this, 'lambda', {
      functionName: `cdktf-integration-alexa${suffix}`,
      handler: 'index.handler',
      runtime: 'nodejs14.x',
      role: role.arn,
      filename: code.asset.path,
      sourceCodeHash: code.asset.assetHash,
      memorySize: options.environment === 'production' ? 512 : 256,
      timeout: 10, // Alexa CF template uses 60 but that seems like overkill since Alexa itself times out after 7 seconds
      // reservedConcurrentExecutions: options.environment === 'production' ? 800 : 10, // set this as needed
      environment: {
        variables: {
          ALEXA_SKILL_ID: options.skillId,
          DYNAMODB_TABLE_NAME: table.name,
          DYNAMODB_TABLE_HASH_KEY: table.hashKey,
        },
      },
      tags: {
        environment: options.environment,
      },
      tracingConfig: { // turn on X-Ray tracing, helpful for debugging
        mode: 'Active',
      },
    });

    // Create Lambda permission
    new LambdaPermission(this, 'lambda-permission', {
      functionName: lambda.functionName,
      action: 'lambda:InvokeFunction',
      principal: 'alexa-appkit.amazon.com',
      eventSourceToken: options.skillId,
    });

    // We need to know our generated Lambda Endpoint at the end
    new TerraformOutput(this, 'lambdaEndpoint', {
      value: lambda.arn,
    });
  }
}

const app = new App();
// Create a stack for production
new AlexaSkillStack(app, 'cdktf-integration-alexa-production', {
  skillId: 'amzn1.ask.skill.xxxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // Replace with your Alexa skill ID
  environment: 'production',
});
/* Uncomment this to create a stack for a developer named Jane */
// new AlexaSkillStack(app, 'cdktf-integration-alexa-jane-dev', {
//   skillId: 'amzn1.ask.skill.xxxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // Replace with Jane's dev skill ID
//   environment: 'development',
//   developerName: 'jane',
// });
app.synth();
