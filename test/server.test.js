const assert = require('node:assert/strict');
const test = require('node:test');

const {
  isConvoRecoveryRequest,
  prepareMessagesForProvider,
} = require('../server');

const incompleteAssistantList = [
  'Here are a few options.',
  '1. 🏠 **First Shelter**: short description',
  '   📞 211 · 🌐 https://211.org',
  '2. 🏠 **Second Shelter**: short description',
].join('\n');

test('chat recovery does not replace a substantive visitor follow-up', () => {
  const messages = [
    { role: 'user', content: 'Can you list shelters near me?' },
    { role: 'assistant', content: incompleteAssistantList },
    { role: 'user', content: 'bro I am scared my son will hurt himself tonight' },
  ];

  assert.equal(isConvoRecoveryRequest(messages), false);

  const prepared = prepareMessagesForProvider(messages);
  assert.equal(prepared, messages);
  assert.equal(
    prepared[prepared.length - 1].content,
    'bro I am scared my son will hurt himself tonight',
  );
});

test('short explicit continuation requests still trigger recovery mode', () => {
  const messages = [
    { role: 'user', content: 'Can you list shelters near me?' },
    { role: 'assistant', content: incompleteAssistantList },
    { role: 'user', content: 'continue please' },
  ];

  assert.equal(isConvoRecoveryRequest(messages), true);
  assert.equal(prepareMessagesForProvider(messages), messages);
});

test('explicit cut-off complaints still trigger recovery mode', () => {
  const messages = [
    { role: 'user', content: 'Can you list shelters near me?' },
    { role: 'assistant', content: incompleteAssistantList },
    { role: 'user', content: 'your reply cut off before finishing the list' },
  ];

  assert.equal(isConvoRecoveryRequest(messages), true);
  assert.equal(prepareMessagesForProvider(messages), messages);
});
