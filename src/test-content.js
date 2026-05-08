const { generateContentWithRetry, generateWeeklyNewsletter } = require('./content/generator');
const logger = require('./logger');
require('dotenv').config();

// Pricing for gpt-4o-mini (per 1M tokens)
const PRICE_INPUT_PER_1M = 0.15;
const PRICE_OUTPUT_PER_1M = 0.60;

/**
 * Calculate cost based on usage
 * @param {Object} usage 
 */
function calculateCost(usage) {
  if (!usage) return 0;
  const inputCost = (usage.prompt_tokens / 1000000) * PRICE_INPUT_PER_1M;
  const outputCost = (usage.completion_tokens / 1000000) * PRICE_OUTPUT_PER_1M;
  return inputCost + outputCost;
}

async function runTest() {
  console.log('🚀 STARTING CONTENT GENERATION TEST\n');
  console.log('====================================');

  const testTypes = [
    { type: 'education', label: '🎓 EDUCATION' },
    { type: 'product', label: '💎 PRODUCT', options: { aspect: 'manfaat' } },
    { type: 'tip', label: '💡 DAILY TIP' },
    { type: 'quick_tip', label: '📝 QUICK TIPS' }
  ];

  let totalTokens = 0;
  let totalCost = 0;

  for (const test of testTypes) {
    try {
      console.log(`\nTesting: ${test.label}...`);
      const result = await generateContentWithRetry(test.type, test.options);
      
      console.log('--- RESULT START ---');
      console.log(result.content);
      console.log('--- RESULT END ---');
      
      const usage = result.usage;
      const cost = calculateCost(usage);
      
      console.log(`\nTokens: ${usage.total_tokens} (Prompt: ${usage.prompt_tokens}, Completion: ${usage.completion_tokens})`);
      console.log(`Estimated Cost: $${cost.toFixed(6)}`);
      
      totalTokens += usage.total_tokens;
      totalCost += cost;
      
      console.log('\n------------------------------------');
    } catch (error) {
      console.error(`❌ Failed to test ${test.type}:`, error.message);
    }
  }

  // Testing Weekly Newsletter (Specially handled)
  try {
    console.log('\nTesting: 📨 WEEKLY NEWSLETTER...');
    const result = await generateWeeklyNewsletter(1, 'Market emas volatile, EA Selia update v2.1, Webinar Sabtu malam');
    
    console.log('--- RESULT START ---');
    console.log(result.content);
    console.log('--- RESULT END ---');
    
    const usage = result.usage;
    const cost = calculateCost(usage);
    
    console.log(`\nTokens: ${usage.total_tokens} (Prompt: ${usage.prompt_tokens}, Completion: ${usage.completion_tokens})`);
    console.log(`Estimated Cost: $${cost.toFixed(6)}`);
    
    totalTokens += usage.total_tokens;
    totalCost += cost;
  } catch (error) {
    console.error('❌ Failed to test weekly newsletter:', error.message);
  }

  console.log('\n====================================');
  console.log('📊 FINAL STATISTICS');
  console.log(`Total Tokens Used: ${totalTokens}`);
  console.log(`Total Estimated Cost: $${totalCost.toFixed(6)}`);
  console.log('====================================');
}

runTest().catch(err => {
  console.error('Test script crashed:', err);
});
