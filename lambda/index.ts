import { 
  ErrorHandler,
  getSlotValue,
  getUserId,
  HandlerInput,
  RequestHandler,
  RequestInterceptor,
  ResponseInterceptor,
  SkillBuilders,
} from 'ask-sdk-core';
import { DynamoDbPersistenceAdapter } from 'ask-sdk-dynamodb-persistence-adapter';
import { Response, SessionEndedRequest } from 'ask-sdk-model';

/** Look up a principle by its id (array index) and craft an Alexa response */
async function getResponseForId(id: number, handlerInput: HandlerInput, useShortResponse?: boolean) {
  const principle = principles[id];
  // Concatenate a standard message with the random principle name and simple explanation
  const speakOutput = `${responses['GET_PRINCIPLE_MESSAGE']} ${principle.name}. ${principle.simple}`;

  const userData = await handlerInput.attributesManager.getPersistentAttributes(true, {});
  // Store which principle the user last heard in our persistent storage (DynamoDB)
  handlerInput.attributesManager.setPersistentAttributes({
    ...userData,
    lastHeardPrinciple: id,
  });
  await handlerInput.attributesManager.savePersistentAttributes();

  return handlerInput.responseBuilder
    .speak(useShortResponse ? principle.simple : speakOutput)
    .reprompt(responses['GET_PRINCIPLE_REPROMPT'])
    .withSimpleCard(principle.name, principle.simple)
    .getResponse();
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (Math.floor(max) - Math.ceil(min)) + Math.ceil(min));
}

// Core functionality for skill lives in this handler:
const getNewPrincipleHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'LaunchRequest' || 
      (request.type === 'IntentRequest' && request.intent.name === 'GetNewPrincipleIntent');
  },
  async handle(handlerInput: HandlerInput) {
    // See if we have any previous data from this user (what they've already heard before)
    const userData = await handlerInput.attributesManager.getPersistentAttributes(true, {});
    // Generate a random integer between 0 and 9 (the number of principles) and grab that principle
    let randomInt;
    do {
      randomInt = getRandomInt(0, principles.length);
    } while (randomInt === userData.lastHeardPrinciple);
    
    return getResponseForId(randomInt, handlerInput);
  },
};

// This looks up a specific principle by name:
const getSpecificPrincipleHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest' && request.intent.name === 'GetSpecificPrincipleIntent';
  },
  async handle(handlerInput: HandlerInput) {
    const spokenName = getSlotValue(handlerInput.requestEnvelope, 'principle') || '';

    // Find the array index of the principle with this ID
    const id = principles.findIndex(principle => principle.name.toLowerCase() === spokenName.trim());
    if (id === -1) {
      return handlerInput.responseBuilder
        .speak(responses['ERROR_MESSAGE'])
        .getResponse();
    }
    
    return getResponseForId(id, handlerInput, true);
  },
};

// This gets the next principle in the list as long as the user has heard something before:
const getNextPrincipleHandler: RequestHandler = {
  async canHandle(handlerInput: HandlerInput) {
    const request = handlerInput.requestEnvelope.request;
    const userData = await handlerInput.attributesManager.getPersistentAttributes(true, {});

    return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.NextIntent' &&
      typeof userData.lastHeardPrinciple !== 'undefined';
  },
  async handle(handlerInput: HandlerInput) {
    const userData = await handlerInput.attributesManager.getPersistentAttributes(true, {});
    let id = userData.lastHeardPrinciple + 1;
    if (id === principles.length) {
      id = 0;
    }
    
    return getResponseForId(id, handlerInput);
  },
};

// This goes beyond the simple explanation if the user says "yes" or "tell me more"
const tellMeMoreHandler: RequestHandler = {
  async canHandle(handlerInput: HandlerInput) {
    const request = handlerInput.requestEnvelope.request;
    const userData = await handlerInput.attributesManager.getPersistentAttributes(true, {});

    return request.type === 'IntentRequest' && typeof userData.lastHeardPrinciple !== 'undefined' &&
      (request.intent.name === 'AMAZON.YesIntent' || request.intent.name === 'MoreIntent');
  },
  async handle(handlerInput: HandlerInput) {
    const userData = await handlerInput.attributesManager.getPersistentAttributes(true, {});
    const id = userData.lastHeardPrinciple;
    const principle = principles[id];

    return handlerInput.responseBuilder
      .speak(principle.extended)
      .withSimpleCard(principle.name, principle.simple)
      .getResponse();
  },
};

const helpHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.HelpIntent';
  },
  handle(handlerInput: HandlerInput) {
    return handlerInput.responseBuilder
      .speak(responses['HELP_MESSAGE'])
      .reprompt(responses['HELP_REPROMPT'])
      .getResponse();
  },
};

const exitHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest' && 
      (request.intent.name === 'AMAZON.CancelIntent' || request.intent.name === 'AMAZON.StopIntent' || 
      request.intent.name === 'AMAZON.NoIntent');
  },
  handle(handlerInput: HandlerInput) {
    return handlerInput.responseBuilder
      .speak(responses['STOP_MESSAGE'])
      .getResponse();
  },
};

const skillDisabledEventHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'AlexaSkillEvent.SkillDisabled';
  },
  async handle(handlerInput: HandlerInput) {
    const userId = getUserId(handlerInput.requestEnvelope);
    // delete the information in DynamoDB associated with this user ID
    if (typeof handlerInput.attributesManager.deletePersistentAttributes !== 'undefined') {
      await handlerInput.attributesManager.deletePersistentAttributes();
      console.log(`Data successfully deleted from DynamoDB for user ${userId}`);
    }

    return handlerInput.responseBuilder.getResponse(); // return an empty response
  },
};

const fallbackHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.FallbackIntent';
  },
  handle(handlerInput: HandlerInput) {
    return handlerInput.responseBuilder
      .speak(responses['FALLBACK_MESSAGE'])
      .reprompt(responses['FALLBACK_REPROMPT'])
      .getResponse();
  },
};

const sessionEndedRequestHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'SessionEndedRequest';
  },
  handle(handlerInput: HandlerInput) {
    const request = handlerInput.requestEnvelope.request as SessionEndedRequest;
    console.log(`Session ended with reason: ${request.reason}`);
    return handlerInput.responseBuilder.getResponse();
  },
};

const customErrorHandler: ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput: HandlerInput, error: Error) {
    console.log(`Error handled: ${error.message}`);
    console.log(`Error stack: ${error.stack}`);
    return handlerInput.responseBuilder
      .speak(responses['ERROR_MESSAGE'])
      .getResponse();
  },
};

const logRequestInterceptor: RequestInterceptor = {
  process(handlerInput: HandlerInput) {
    console.log(JSON.stringify(handlerInput.requestEnvelope));
  },
};

const logResponseInterceptor: ResponseInterceptor = {
  process(handlerInput: HandlerInput, response: Response) {
    console.log(JSON.stringify(response));
  },
};

const skillBuilder = SkillBuilders.custom();
exports.handler = skillBuilder
  .withSkillId(process.env.ALEXA_SKILL_ID as string)
  .addRequestHandlers(
    getNewPrincipleHandler,
    getSpecificPrincipleHandler,
    getNextPrincipleHandler,
    tellMeMoreHandler,
    helpHandler,
    exitHandler,
    skillDisabledEventHandler,
    fallbackHandler,
    sessionEndedRequestHandler,
  )
  .addErrorHandlers(customErrorHandler)
  .addRequestInterceptors(logRequestInterceptor)
  .addResponseInterceptors(logResponseInterceptor)
  .withPersistenceAdapter(new DynamoDbPersistenceAdapter({
    tableName: process.env.DYNAMODB_TABLE_NAME as string,
    partitionKeyName: process.env.DYNAMODB_TABLE_HASH_KEY as string,
    createTable: false,
  }))
  .lambda();

const skillName = 'HashiCorp Principles';
const responses = {
  GET_PRINCIPLE_MESSAGE: 'Here\'s one of our principles:',
  GET_PRINCIPLE_REPROMPT: 'Would you like to learn more?',
  HELP_MESSAGE: `You can say: "tell me a principle". Or, you can ask for information about a specific principle by saying: "tell me about Beauty Works Better". Or, you can say: "exit". What can I help you with?`,
  HELP_REPROMPT: 'What can I help you with?',
  FALLBACK_MESSAGE: `The ${skillName} skill can't help you with that. It can help you learn about HashiCorp's company principles if you say: "tell me a principle". Or, you can ask for information about a specific principle by saying: "tell me about Beauty Works Better". What can I help you with?`,
  FALLBACK_REPROMPT: 'What can I help you with?',
  ERROR_MESSAGE: 'Hmm, something went wrong. Please try again later.',
  STOP_MESSAGE: 'Okay, goodbye!',
};

interface Principle {
  name: string;
  simple: string;
  extended: string;
}
const principles: Principle[] = [
  {
    name: 'Integrity',
    simple: `Integrity is the deepest and most core principle of HashiCorp, encompassing moral, intellectual, personal, and corporate integrity. Integrity requires a consistency of our thoughts, words, and actions and a dedication to the truth.`,
    extended: `<p>Integrity builds trust, upon which the strongest relationships are built. When we trust others, we are more willing to be open and engage. We must foster relationships internally to create a friendly, productive, and positive environment and externally with our users, partners, and customers to drive the adoption of our tools and products.</p>
      <p>When we speak of moral integrity, we are applying the golden rule to treat others as you would like to be treated. Intellectual integrity demands that we acknowledge reality and that our words and actions are consistent with our understanding. Personal and corporate integrity means that we must demand this standard of every person as well as the collective.</p>
      <p>As our core principle there can be no exemptions or compromises. There is no employee, user, partner, or customer that can be excused or allow us to compromise our own integrity.</p>`,
  },
  {
    name: 'Kindness',
    simple: `Long after we forget the details of an interaction, we remember how we felt. This extends to our impressions of people, websites, tools, and products. Producing beautiful work ensures a positive association, and kindness to people does the same. These associations change the propensity for future interactions, since nobody wants to feel bad (or work with an asshole).`,
    extended: `<p>Kindness should be extended at every opportunity, to our peers, users, partners, and customers. An internal environment that is friendly, kind, and forgiving of mistakes is positive and productive. Kindness externally builds our social capital, reputation, and makes our customers want to engage with us in the future.</p>
      <p>In the face of our own personal frustration, it is often difficult to remember that our actions will be received by another thoughtful, emotional human being. We should assume the best in people, communicate kindly, and understand that the intention of another’s actions are usually to be helpful in return. In some cases, we may be the recipients of unkindness. We always choose to respond with kindness, in the hope that we can move towards a better communication environment. If this isn’t possible, you may choose to exit the conversation. We can’t change the unkindness of others, but we can preserve the kindness of ourselves.</p>`,
  },
  {
    name: 'Pragmatism',
    simple: `HashiCorp will always be focused on innovating and pushing the boundaries in an attempt to deeply impact the status quo. Forward progress requires strong grounding in reality. For us to effectively change the status quo, we must understand it however undesirable it may be. It is these practical considerations rather than the theoretical that demand pragmatism.`,
    extended: `<p>When faced with a complex decision, we should always welcome an open conversation and encourage constructive disagreement so that a broad set of views are considered. Achieving unanimous agreement among a large group of individuals is often impossible. To make progress and succeed as a team, although each of us will sometimes disagree, it is necessary for all of us to commit to the outcome of a decision and move forward.</p>
      <p>Pragmatism is one of the few traits that is shared with the Tao of HashiCorp, and that is because it should impact every layer of our thinking.</p>`,
  },
  {
    name: 'Humility',
    simple: `Humility starts with acknowledging that our knowledge is imperfect and incomplete, but not fixed. We can continue to learn and grow but this is an active process that we must choose to engage in. This growth comes from constantly seeking feedback, learning, and adapting based on new understanding. In this context, we must view mistakes as learning opportunities in an active process of reflection and analysis.`,
    extended: `<p>We must avoid overconfidence in our knowledge, but also in the value that we deliver to the company as individuals and to our customers as an organization. Through the same active process of learning, reflecting, and adapting, we must increase the effectiveness of our execution and challenge ourselves to solve new problems.</p>`,
  },
  {
    name: 'Vision',
    simple: `Every action we take moves us in some direction. Vision is a point much farther than a single action can take us. Having a vision allows us to judge if an action moves us closer or further from our vision. Without vision, each action big or small is no better than a random walk in the hope that we end up somewhere we’d like to be. By having a vision, we try to move in some direction, rather than moving in no singular direction at all. Vision requires you to reflect on the big picture; to understand the greater goal behind the smaller actions.`,
    extended: `<p>An organization must be cohesive in its shared, common vision. Individuals may have conflicting vision which can be uncomfortable but with thoughtful conversation vision can evolve over time. Here we depend on our other principles: kindness in disagreement, humility to accept we may be wrong, pragmatism to accept new realities, cohesion in our execution, and reflection to adapt our views. Regardless of these disagreements, as members of an organization we must choose to stand behind the greater common goal.</p>`,
  },
  {
    name: 'Execution',
    simple: `The execution of an idea matters much more than the idea itself. This means that the best idea poorly executed is no better than a mediocre idea well executed. Action should always be preferred to inaction and uncertainty around the best idea must not prevent execution. Organizationally we should strive towards single decision makers who promote group discussion and buy in but act without requiring consensus.`,
    extended: `<p>The best execution must be both effective and efficient, which we can think of direction and velocity. Effective execution depends on going the right direction, meaning there is an alignment with vision and strategic goals with the highest priority work being done first. Without effective execution, work may get done without advancing towards the end goal.</p>
      <p>Efficient execution measures our velocity and using minimal resources through leverage. It is important to take a long term view when measuring velocity, as it allows costs to be amortized. Automating or eliminating tasks may reduce short term efficiency but increase long run productivity. Doing a task well once pays dividends to doing it many times. Measure twice, cut once.</p>`,
  },
  {
    name: 'Communication',
    simple: `For the organization to execute well, it is necessary that all levels of individuals execute well. However, an individual cannot efficiently execute autonomously without the context of the broader strategic goals. This demands a cohesion at every level of the company through frequent and detailed communication of goals and strategy. The goal of this communication is to ensure a shared understanding, while being as concise as possible without being terse.`,
    extended: `<p>Communication should extend from top-down to provide the strategic context necessary and bottom-up to provide feedback. This enables every individual to prioritize their work and execute efficiently while feedback allows strategy to adapt to changing conditions.</p>`,
  },
  {
    name: 'Beauty Works Better',
    simple: `Beauty can exist in any job well done. A job well done requires applying a sense of purpose and thoughtfulness, a consideration for the consumer of our work. In this way, we must treat our work as a craft to be practiced and perfected. This attention to detail should be applied to everything we produce internally and externally.`,
    extended: `<p>Beyond natural beauty, making something beautiful is an active choice. It is a choice between thorough attention to detail and a consideration of our peers, users, partners and customers, or a cursory effort which is ultimately inefficient in its execution. Making something beautiful requires more short term effort, but increases the longevity and long term efficiency.</p>
      <p>Beauty also takes shape in many forms: in the wording of a document, the implementation of a technical feature, the syntax of a configuration file, and much, much more. We should strive for beauty in all forms of our work, and in doing so we should understand that other members of our community may be more skillful at producing a certain kind of beauty. There is no shame in not achieving a perfect skill in all categories. Instead, we should complement the strengths of each other and reach out to others for help. Together, we can create truly beautiful work.</p>`,
  },
  {
    name: 'Reflection',
    simple: `Reflection requires thoughtful and objective consideration and is a recurring theme across our principles. At its simplest, we must ask ourselves what could be done differently, allowing us to learn from our successes and our mistakes. We must be humble and use hindsight to recognize our mistakes so that we can learn, pragmatic in accepting new realities even if we must admit to a mistake, and reflective to adapt our goals and strategies.`,
    extended: `<p>This reflection is not limited to individuals, and can be applied to the organizational structure and processes as well. When process is implemented, it is to make repeated interactions more efficient and to provide leverage. When the status quo prevents progress we must reflect on how it can be adapted to better serve its participants.</p>
      <p>Reflection provides independent thinking and a healthy level of skepticism with an ability to question our understanding, execution, and adherence to our principles.</p>`,
  }
]
