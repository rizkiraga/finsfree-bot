require('dotenv').config();
const axios = require('axios');

async function debugFF() {
  console.log('🔍 DEBUGGING FOREX FACTORY CALENDAR FEED');
  console.log('');

  const todayUTC = new Date().toISOString().split('T')[0];
  console.log(`Today (UTC): ${todayUTC}`);
  console.log('URL: https://nfs.faireconomy.media/ff_calendar_thisweek.json');
  console.log('');

  try {
    const response = await axios.get('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });

    const data = response.data;
    console.log(`Status: ${response.status}`);
    console.log(`Total events this week: ${Array.isArray(data) ? data.length : 'NOT AN ARRAY'}`);
    console.log('');

    if (!Array.isArray(data)) {
      console.log('❌ Raw response:', JSON.stringify(data, null, 2));
      return;
    }

    // Show first event to understand structure
    console.log('📋 FIRST EVENT (raw structure):');
    console.log(JSON.stringify(data[0], null, 2));
    console.log('');

    // Track all unique impact values
    const impacts = new Set();
    data.forEach(e => impacts.add(e.impact));
    console.log('📊 Unique impact values:', Array.from(impacts));
    console.log('');

    // Filter high impact
    const highImpactAll = data.filter(e => e.impact && e.impact.toLowerCase() === 'high');

    console.log(`🔴 Total High Impact Events THIS WEEK: ${highImpactAll.length}`);
    highImpactAll.forEach(e => {
      console.log(`  - ${e.date} | [${e.country}] ${e.title}`);
    });

    // Filter today's high impact
    const todayHigh = data.filter(e =>
      e.impact && e.impact.toLowerCase() === 'high' &&
      e.date && e.date.startsWith(todayUTC)
    );

    console.log(`🔴 High Impact Events TODAY (${todayUTC}): ${todayHigh.length}`);
    todayHigh.forEach(e => {
      console.log(`  - ${e.date} | [${e.country}] ${e.title} | Forecast: ${e.forecast} | Prev: ${e.previous}`);
    });

    // Also all events today
    const todayAll = data.filter(e => e.date && e.date.startsWith(todayUTC));
    console.log(`\n📅 ALL events today: ${todayAll.length}`);
    todayAll.forEach(e => {
      console.log(`  - ${e.date} | [${e.impact}] ${e.title}`);
    });

  } catch (err) {
    console.error('❌ ERROR:', err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', err.response.data);
    }
  }
}

debugFF();
