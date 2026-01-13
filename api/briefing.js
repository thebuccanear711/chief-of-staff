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
        
        let searchQuery;
        if (category === 'global') {
          searchQuery = 'top global news stories today';
        } else {
          searchQuery = 'latest news legal tech AI stenography court reporting';
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
              content: `Find 5 ${category === 'global' ? 'top global news' : 'legal tech, AI in legal, or stenography'} stories from the last 24 hours.

CRITICAL: Return ONLY valid JSON, no preamble or explanation. Format:
[
  {
    "title": "Headline here",
    "summary": "1-2 sentence summary",
    "url": "https://source.com/article",
    "source": "Source Name",
    "imageUrl": "https://image-url.com/image.jpg"
  }
]

Requirements:
- Use only FREE news sources (Reuters, AP, BBC, TechCrunch, etc.)
- Each story must have a working URL
- Summaries should be 1-2 sentences max
- Include a relevant image URL if available (or use a placeholder)
- Focus on ${category === 'global' ? 'major global events' : 'legal technology, AI in legal practice, court reporting, and stenography'}

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
          throw new Error('Failed to parse news data');
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
