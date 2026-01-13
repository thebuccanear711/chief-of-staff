// api/briefing.js
// Backend API for Daily Briefing data

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, apiKey } = req.body;

    switch (action) {
      case 'getWeather': {
        const weatherKey = process.env.WEATHER_API_KEY;
        const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=Los Angeles,US&appid=${weatherKey}&units=imperial`;
        
        const weatherResponse = await fetch(weatherUrl);
        const weatherData = await weatherResponse.json();

        if (!weatherResponse.ok) {
          throw new Error('Weather API failed');
        }

        return res.status(200).json({
          success: true,
          weather: {
            temp: Math.round(weatherData.main.temp),
            feels_like: Math.round(weatherData.main.feels_like),
            description: weatherData.weather[0].description,
            icon: weatherData.weather[0].icon,
            humidity: weatherData.main.humidity,
            wind_speed: Math.round(weatherData.wind.speed)
          }
        });
      }

      case 'getStocks': {
        const stockKey = process.env.STOCK_API_KEY;
        
        // Get S&P 500 (using SPY ETF as proxy)
        const spUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=SPY&apikey=${stockKey}`;
        const spResponse = await fetch(spUrl);
        const spData = await spResponse.json();

        // Get NASDAQ (using QQQ ETF as proxy)
        const nasdaqUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=QQQ&apikey=${stockKey}`;
        const nasdaqResponse = await fetch(nasdaqUrl);
        const nasdaqData = await nasdaqResponse.json();

        if (!spData['Global Quote'] || !nasdaqData['Global Quote']) {
          throw new Error('Stock API failed or rate limit reached');
        }

        const spQuote = spData['Global Quote'];
        const nasdaqQuote = nasdaqData['Global Quote'];

        return res.status(200).json({
          success: true,
          stocks: {
            sp500: {
              price: parseFloat(spQuote['05. price']).toFixed(2),
              change: parseFloat(spQuote['09. change']).toFixed(2),
              changePercent: spQuote['10. change percent'].replace('%', '')
            },
            nasdaq: {
              price: parseFloat(nasdaqQuote['05. price']).toFixed(2),
              change: parseFloat(nasdaqQuote['09. change']).toFixed(2),
              changePercent: nasdaqQuote['10. change percent'].replace('%', '')
            }
          }
        });
      }

      case 'getNews': {
        if (!apiKey) {
          return res.status(400).json({ error: 'Anthropic API key required' });
        }

        const { category } = req.body;
        
        let searchPrompt;
        if (category === 'global') {
          searchPrompt = 'Find 5 top global news stories from TODAY. Return ONLY valid JSON with title, summary, url, source, imageUrl for each.';
        } else {
          searchPrompt = `Find 5 recent interesting news stories. Follow this priority order:

PRIORITY 1 (Preferred): Legal Technology & AI in Legal
- Legal tech companies and startups (Clio, LexisNexis, Westlaw, etc.)
- AI tools specifically for lawyers and law firms
- Court reporting and deposition technology (like Steno, Veritext)
- E-discovery and document review AI
- Practice management and case management software
- Legal research AI tools
- Contract analysis and review technology

PRIORITY 2 (If not enough Priority 1): Broader Legal Industry
- Law firm news and mergers
- Major legal cases and verdicts
- Changes in legal regulations
- Legal industry trends
- Attorney and law firm technology adoption

PRIORITY 3 (If still not enough): General AI & Technology
- AI developments and breakthroughs
- Enterprise AI adoption
- Tech company news
- Software and SaaS developments

Search broadly and return the 5 most relevant and recent stories you can find from the past week. Prioritize Priority 1, but include Priority 2 and 3 if needed to get 5 good stories.

Return ONLY valid JSON with title, summary, url, source, imageUrl for each story.`;
        }

        // Use Claude with web search to find news
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4000,
            messages: [{
              role: 'user',
              content: `${searchPrompt}

CRITICAL: Return ONLY valid JSON, no preamble or explanation. Format:
[
  {
    "title": "Headline here",
    "summary": "1-2 sentence summary",
    "url": "https://source.com/article",
    "source": "Source Name",
    "imageUrl": "https://image-url.com/image.jpg or null"
  }
]

Requirements:
- Use only FREE news sources (TechCrunch, The Verge, Reuters, Legal Dive, ABA Journal, etc.)
- Each story must have a working URL
- Summaries should be 1-2 sentences max
- Use null for imageUrl if no real image available
- Return exactly 5 stories

Return ONLY the JSON array, nothing else.`
            }],
            tools: [{
              type: "web_search_20250305",
              name: "web_search"
            }]
          })
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error?.message || 'News API failed');
        }

        let newsText = '';
        if (data.content) {
          newsText = data.content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('\n');
        }

        // Extract JSON from response
        const jsonMatch = newsText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          // Return placeholder data if search fails completely
          const placeholderStories = Array(5).fill(null).map((_, i) => ({
            title: "News Unavailable",
            summary: "Unable to fetch news at this time. Please try refreshing in a few moments.",
            url: "#",
            source: "System",
            imageUrl: null
          }));
          
          return res.status(200).json({
            success: true,
            stories: placeholderStories
          });
        }

        const stories = JSON.parse(jsonMatch[0]);

        return res.status(200).json({
          success: true,
          stories: stories
        });
      }

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Briefing API Error:', error);
    return res.status(500).json({ 
      error: 'Briefing operation failed', 
      details: error.message 
    });
  }
}
