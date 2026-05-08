process.env.TWELVE_DATA_API_KEY = 'test_key';
const { generateNewsTradingContent, generateIntroContent } = require('./content/generator');
const logger = require('./logger');

async function testAll() {
  await testNewsGeneration();
  console.log('\n\n');
  await testIntroGeneration();
}

async function testIntroGeneration() {
  console.log('🚀 TESTING INTRODUCING FINSFREE CONTENT GENERATION');
  console.log('====================================');

  try {
    const result = await generateIntroContent();
    
    console.log('\n--- RESULT START ---');
    console.log(result.content);
    console.log('--- RESULT END ---');
    
    const charCount = result.content.length;
    console.log(`\nCharacter Count: ${charCount}`);
    
    if (charCount <= 250) {
      console.log('✅ PASS: Under 250 characters');
    } else {
      console.log('❌ FAIL: Over 250 characters');
    }
  } catch (error) {
    console.error('Intro test failed:', error);
  }
}

async function testNewsGeneration() {
  console.log('🚀 TESTING NEWS TRADING CONTENT GENERATION');
  console.log('====================================');

  const mockNewsItem = {
    title: 'CPI m/m',
    event: 'CPI m/m',
    country: 'USD',
    date: '2026-03-11T08:30:00-04:00',
    impact: 'High',
    estimate: '0.3%',
    previous: '0.2%'
  };

  try {
    const result = await generateNewsTradingContent(mockNewsItem);
    
    console.log('\n--- RESULT START ---');
    console.log(result.content);
    console.log('--- RESULT END ---');
    
    const charCount = result.content.length;
    console.log(`\nCharacter Count: ${charCount}`);
    
    if (charCount <= 500) {
      console.log('✅ PASS: Under 500 characters');
    } else {
      console.log('❌ FAIL: Over 500 characters');
    }
  } catch (error) {
    console.error('News test failed:', error);
  }
}

testAll();
