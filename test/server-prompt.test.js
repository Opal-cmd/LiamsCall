const assert = require('assert');

const {
  buildSystemPrompt,
  canUseVerifiedNorthAmericaResourceTable,
} = require('../server');

const resourceMessages = [
  {
    role: 'user',
    content: 'What resources are near me for addiction programs?',
  },
];

const ukGeo = {
  city: 'London',
  region: 'England',
  country: 'United Kingdom',
  countryCode: 'GB',
};

const canadaGeo = {
  city: 'Toronto',
  region: 'Ontario',
  country: 'Canada',
  countryCode: 'CA',
};

{
  const prompt = buildSystemPrompt(ukGeo, resourceMessages);

  assert.match(prompt, /not covered by the verified North America table/);
  assert.match(prompt, /do not force exactly 5 items/);
  assert.doesNotMatch(prompt, /The visitor wants a local resource list\. Reply with exactly 5 compact items/);
}

{
  const prompt = buildSystemPrompt(canadaGeo, resourceMessages);

  assert.match(prompt, /The visitor wants a local resource list\. Reply with exactly 5 compact items/);
  assert.doesNotMatch(prompt, /not covered by the verified North America table/);
}

{
  const messages = [{ role: 'user', content: 'Can you list resources in the United States?' }];
  assert.equal(canUseVerifiedNorthAmericaResourceTable(null, messages), true);
}
