# cdktf-integration-alexa-example

This repository contains a working example to deploy an Amazon Alexa skill to AWS Lambda (including a DynamoDB table for persistent storage), written in TypeScript and deployed with the [CDK for Terraform](https://cdk.tf). This is a proof-of-concept to show that it _could_ be done, but not an opinionated take that Alexa skills _should_ be deployed this way; for more information on the motivations behind the creation of this sample codebase, see the [Background](#background) section.

## Guide

### Prerequisites

You will need to have the following accounts ready before following the steps in this guide:

- An [Amazon Web Services](https://aws.amazon.com) account - sign up [here](https://portal.aws.amazon.com/billing/signup?nc2=h_ct&src=default&redirect_url=https%3A%2F%2Faws.amazon.com%2Fregistration-confirmation#/start)
- An [Amazon Developer](https://developer.amazon.com) account - note that this is **separate** from your AWS account, but you can use your regular Amazon.com login credentials and sign up [here](https://developer.amazon.com/settings/console/registration?return_to=/)
- _(Optional)_ A [Terraform Cloud](https://app.terraform.io/) account - sign up [here](https://app.terraform.io/signup/account)

If you choose not to use Terraform Cloud, this app will store Terraform [state](https://www.terraform.io/language/state) locally and all Terraform operations will happen on your local machine. This is fine for example/test purposes but not recommended for production usage.

Your machine must also be running **[node.js v14+](https://nodejs.org/)**. We recommend using [nvm](https://github.com/nvm-sh/nvm) or a [Docker](https://www.docker.com/products/docker-desktop) container.

Next, you need to install/run the following (if you've run this or a similar tutorial before, you can probably skip these steps):

1. Install the [Terraform 0.14+ CLI](https://learn.hashicorp.com/tutorials/terraform/install-cli) locally

    Then run `terraform login` if you plan to use Terraform Cloud to store your state

2. Install CDKTF: `npm install --global cdktf-cli@latest`

3. Install the [Alexa Skills Kit CLI](https://developer.amazon.com/en-US/docs/alexa/smapi/quick-start-alexa-skills-kit-command-line-interface.html): `npm install --global ask-cli`

    Then run `ask configure` to login in with your Amazon Developer account and link your AWS credentials

    Assuming that you want to use the AWS profile you just configured in the previous step, you'll also want to run `export AWS_PROFILE="ask_cli_default"` and/or store that environment variable in a way where it persists for this project

### Setup

In your terminal, clone the [sample repository](https://github.com/xiehan/cdktf-integration-alexa-example):

```shell
git clone https://github.com/xiehan/cdktf-integration-alexa-example.git
```

Navigate to the cloned repository:

```shell
cd cdktf-integration-alexa-example
```

Use the ASK CLI to create your Alexa skill and retrieve its ID (which we need in order to do anything else):

```shell
ask deploy --target skill-metadata
```

A successful response will look something like this:

```
Deploy configuration loaded from ask-resources.json
Deploy project for profile [default]

==================== Deploy Skill Metadata ====================
Skill package deployed successfully.
skill ID: amzn1.ask.skill.xxxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

However, this step will sometimes fail for unexplained reasons with the very helpful error message of `Error occurred while updating interaction model.` If that happens, wait at least 5 minutes and try running the same command again.

Once you have successfully created your Alexa skill (you can go into the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) to verify it exists), open up [`main.ts`](./main.ts) in your code editor of choice and update the following section of the code near the end of the file:

```ts
// Create a stack for production
new AlexaSkillStack(app, 'cdktf-integration-alexa-example', {
  skillId: 'amzn1.ask.skill.xxxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // Replace with your Alexa skill ID
  environment: 'production',
});
```

Replace the `skillId` config variable above with the actual ID you received back from the ASK CLI.

Now you can do a dry run of your Terraform configuration:

```shell
cdktf synth
```

If you're familiar with Terraform JSON, you can inspect the contents of your newly-generated `cdktf.out/` directory to see if the results look like what you might expect. Otherwise, as long as the previous step did not lead to any errors, you can go ahead and deploy:

```shell
cdktf deploy
```

The result should look something like:

```shell
Deploying Stack: cdktf-integration-alexa-example
Resources
 ✔ AWS_DYNAMODB_TABLE    database            aws_dynamodb_table.database
 ✔ AWS_LAMBDA_FUNCTION   lambda              aws_lambda_function.lambda
 ✔ AWS_LAMBDA_PERMISSION lambda-permission   aws_lambda_permission.lambda-permission

Summary: 3 created, 0 updated, 0 destroyed.

Output: lambdaEndpoint = arn:aws:lambda:us-east-1:xxxxxxxxxxxx:function:cdktf-integration-alexa
```

Make note of that final output - the location of the Lambda endpoint. You need it for the next step.

Now, open up [`skill-package/skill.json`](./skill-package/skill.json) in your Code Editor, scroll towards the bottom, and look for:

```json
    "apis": {
      "custom": {}
    },
```

Update this with the Lambda endpoint from above and add an `events` section as follows:

```json
    "apis": {
      "custom": {
        "endpoint": {
          "uri": "arn:aws:lambda:us-east-1:xxxxxxxxxxxx:function:cdktf-integration-alexa"
        }
      }
    },
    "events": {
      "endpoint": {
        "uri": "arn:aws:lambda:us-east-1:xxxxxxxxxxxx:function:cdktf-integration-alexa"
      },
      "subscriptions": [
        {
          "eventName": "SKILL_DISABLED"
        }
      ]
    },
```

Now deploy your Alexa skill manifest again:

```shell
ask deploy --target skill-metadata
```

You should now have a working, testable Alexa skill! Note that Alexa skills are not available to the public until you go through certification; in other words, no one but you can access this particular skill right now.

### Testing

The easiest way to test your skill is to open the Alexa Developer Console in your browser, click on your skill, and then go to the "Test" tab. If you own an Echo device or have the Alexa app on your phone, and if this device or app uses the same Amazon account as the one you used to sign up for Amazon Developer Console access, you should be able to access your own skill by talking to your device and saying, "Alexa, launch HashiCorp Principles."

## Usage

The bundled Alexa skill, named "HashiCorp Principles", is a simple conversational interface loosely adapted from the [Alexa fact skill sample](https://github.com/alexa-samples/skill-sample-nodejs-fact), using the [HashiCorp company principles](https://www.hashicorp.com/our-principles) as content. It supports the following utterances (and slight variations of):

  - _"Alexa, open HashiCorp Principles"_ or _"Alexa, launch HashiCorp principles"_ will launch the skill, look up a random company principle, and read out a brief description
    - When Alexa is done speaking, you can say _"tell me more"_ and she will read the extended description of the same principle
    - When Alexa is done speaking, you can also say _"next"_ and she will give the name and a short description of the next principle in the list
    - If you do not respond when Alexa is done speaking, she will ask, _"Would you like to learn more?"_
      - Respond _"yes"_ or _"tell me more"_ and she will read the extended description of the same principle
      - Respond _"no"_ and the skill will exit
  - _"Alexa, ask HashiCorp Principles to tell me a principle"_ functions the same as the utterance above, including all of the possible followup options
  - _"Alexa, ask HashiCorp Principles to tell me about Kindness"_ or _"Alexa, ask HashiCorp principles to explain Beauty Works Better"_ will give you a brief description of the chosen principle
    - The follow-up options are the same as for the utterances above
  - _"Alexa, ask HashiCorp Principles for help"_ will give you a menu of options to choose from
  - _"Alexa, stop"_ or _"Alexa, exit"_ will close the skill at any time when it is active

The skill uses an [Amazon DynamoDB](https://aws.amazon.com/dynamodb/) table for session persistence, ensuring that whenever you speak an utterance that should give you a random principle or the next principle in the list, it will not read the same one the last time you accessed the skill. This is a fairly primitive use case for DynamoDB and session persistence, but it does the job in validating this proof-of-concept.

All of the code powering the Alexa skill can be found in [`lambda/index.ts`](./lambda/index.ts). Note that putting all of your Alexa skill code in a single file is not recommended for complex production projects, but given that some of the folks referencing this sample project may not be familiar with Alexa skills and their common architecture, I purposely eschewed best practices in favor of keeping the repository structure as simple as possible, so that you don't have to go hunting around to try to figure out where a piece of code lives.

In keeping with Amazon conventions, the Alexa [skill manifest](https://developer.amazon.com/en-US/docs/alexa/smapi/skill-manifest.html) can be found in [`skill-package/skill.json`](./skill-package/skill.json), and the English-language [interaction model](https://developer.amazon.com/en-US/docs/alexa/smapi/interaction-model-schema.html) can be found in [`skill-package/interactionModels/custom/en-US.json`](./skill-package/interactionModels/custom/en-US.json). The latter is where you would go to add additional sample utterances, for example.

## Background

As the primary author of this example codebase, I ([@xiehan](https://github.com/xiehan)) was new to CDKTF and wanted to test my understanding of the project by applying it to something I know well: Alexa skill development, which I did a lot of in a previous life. This isn't an opinionated take that the Terraform CDK _should_ be used for this use case; if anything, I went into it with a hypothesis that CDKTF probably _isn't_ a great solution for this, but I wanted to validate my assumption by testing it out.

The problem with CDKTF (and infrastructure-as-code in general) in the context of Alexa skill development is that the vast majority of these developers are rarely setting up their AWS Lambda more than once per skill. Sure, you're probably deploying your code frequently, but there are various CI tools that can do that for you; you don't need Terraform for that. But the Lambda configuration itself tends to be fairly static; from a developer's perspective it's often a set-it-and-forget-it type of deal.

Beyond that, Amazon's [Alexa Skills Kit CLI](https://developer.amazon.com/en-US/docs/alexa/smapi/quick-start-alexa-skills-kit-command-line-interface.html) already provides lots of handy tooling for creating a new skill and deploying to AWS, particularly if you do `ask new` to set up a new project and choose to use the built-in CloudFormation integration. If you then run `ask deploy`, it will both upload your code to AWS Lambda (creating the infrastructure if it does not already exist) _and_ update the skill manifest and interaction model in the Alexa Service. In this current CDKTF integration example, these are all separate steps, making it an inferior workflow.

Lastly, even for those who don't want to use the ASK CLI but who do want a (light) infrastructure-as-code solution, the [Serverless framework](https://www.serverless.com/) already exists, and while it has never been the most popular tool for Alexa developers, it is [fully supported](https://www.serverless.com/framework/docs/providers/aws/events/alexa-skill).

### Potential use cases for CDKTF

I could see CDKTF being useful for Alexa skill development only in the following cases:

#### The entire organization is already using Terraform

If there's an org-wide initiative to get all infrastructure into Terraform, particularly if it's enforced by a platform engineering team but where in this case we do want the Alexa skill developers to have control their infrastructure themselves, then CDKTF is a great solution that will make everyone happy: the platform team can rest content that all aspects of the skill's infrastructure are managed through Terraform, while the Alexa developers can manage that configuration through TypeScript rather than having to learn HCL.

#### There is a sizeable team of developers working on the same Alexa skill

One headache I faced on my last team was that we had several engineers working on the same Alexa skill, and Amazon really doesn't give you any tools to elegantly deal with that. Every skill ships with what are essentially a staging and production version, but that's it. If you're in a scenario where multiple developers are working on different features and each really needs their own development environment rather than all using the same staging one, it's up to you to cobble together a solution.

Funny enough, I talked to a few other teams who faced this issue and it seems like in the end everyone arrived at the same solution: every developer ends up just creating their own version of the skill, pointed at their own Lambda. That means that given a hypothetical team of Alice, Bob, and Jane, the company's combined set of Alexa skills and infrastructure might look something like this:

| Alexa skill name               | Lambda function name                 | DynamoDB table name                  |
|--------------------------------|--------------------------------------|--------------------------------------|
| HashiCorp Principles           | hashicorp-principles-skill           | hashicorp-principles-skill           |
| HashiCorp Principles Alice Dev | hashicorp-principles-skill-alice-dev | hashicorp-principles-skill-alice-dev |
| HashiCorp Principles Bob Dev   | hashicorp-principles-skill-bob-dev   | hashicorp-principles-skill-bob-dev   |
| HashiCorp Principles Jane Dev  | hashicorp-principles-skill-jane-dev  | hashicorp-principles-skill-jane-dev  |

... So even though Alexa infrastructure is normally set-it-and-forget-it, now, suddenly, you've got 4 Lambdas, 4 DynamoDB tables, etc. But maybe the development versions don't need _identical_ settings to the production infrastructure; DynamoDB's provisioned throughput is a great example where the version receiving real user traffic needs high thresholds, while the minimums will do just fine for development environments. And not to mention what needs to happen when, for example, Bob leaves and the team onboards a new developer named Charlie. It'd be nice to have all of that configuration templated so that you push a button and Charlie's set up and ready to go, with the same solid, well-tested infrastructure that Alice and Jane are already using to develop on every day. So yeah, _now_ you have a great use case for infrastructure as code.

And here, the CloudFormation setup that the ASK CLI can provide for you out-of-the-box wasn't really designed for this use case; it's only configured for your production skill. So this might be the best use case to date for CDKTF, _particularly_ if the above is also true, and the rest of the organization is already using Terraform, so there is precedent for going with this slightly more heavy-handed solution.

#### This organization has multiple (smaller) Alexa skills

I have heard stories of other companies who butted up against some of the limitations of what their interaction model and state management could handle, and endeavored to break up their one large skill into multiple smaller skills. I personally am not familiar with this use case since at my last workspace, we actually did the opposite (combined a couple of skills into one skill to rule them all). But, I could see how, similarly to the use case above with multiple developers, if you're running multiple smaller skills and using similar or even the same configuration for all of them, then something like CDKTF could make your life a bit easier.

## Limitations

The biggest limitation was already briefly alluded to above in the [Background](#background) section, but to expand on that a little, in this CDKTF integration example in its present state, anytime a user is both making changes to the skill's interaction model as well as the code, these changes must always be deployed separately:

```shell
ask deploy --target skill-metadata # to deploy the interaction model changes
cdktf deploy # to deploy the code
```

However, if the user had configured their project using the ASK CLI with a CloudFormation template, then all of this can happen in a single step: `ask deploy`. In other words: we've added a ton of code overhead for what is a less developer-friendly workflow than what Amazon provides out-of-the-box. Not a great selling point.

The good news is that a solution has already been proposed that, when implemented, could allow us to create a better workflow: [#682 Lifecycle Hooks](https://github.com/hashicorp/terraform-cdk/issues/682). A preDeploy or postDeploy hook that calls `ask deploy --target skill-metadata` under-the-hood would allow us to mimic the functionality of `ask deploy` and have everything be updated with a single command.

In particular, I'm hoping that the postDeploy hook would give us access to the `lambdaEndpoint` variable returned by the `TerraformOutput` when `cdktf deploy` is run. You could imagine a script that then takes that Lambda endpoint and updates the relevant lines in the [skill manifest](https://developer.amazon.com/en-US/docs/alexa/smapi/skill-manifest.html) automatically before running `ask deploy --target skill-metadata` to point the skill to the right place, removing several steps from the end of the [Setup](#setup) process above.
