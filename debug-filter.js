const { fetchEconomicCalendar, filterHighImpactNews } = require('./src/utils/newsFeed');

async function debugFilter() {
    const calendar = await fetchEconomicCalendar();
    console.log('Total calendar events:', calendar.length);
    
    const options = { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' };
    const todayStr = new Date().toLocaleDateString('en-CA', options);
    console.log('Today (Jakarta):', todayStr);

    const highImpactAll = calendar.filter(e => e.impact && e.impact.toLowerCase() === 'high');
    console.log('High Impact this week:', highImpactAll.length);

    highImpactAll.forEach(e => {
        const eventDate = new Date(e.date);
        const eventDayStr = eventDate.toLocaleDateString('en-CA', options);
        const isMatch = eventDayStr === todayStr;
        console.log(`- Event: ${e.title} | Date: ${e.date} | Jakarta Day: ${eventDayStr} | Match: ${isMatch}`);
    });

    const filtered = filterHighImpactNews(calendar);
    console.log('\nFinal Filtered count:', filtered.length);
}

debugFilter();
