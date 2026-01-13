// api/calendar.js
// Backend API for Google Calendar access

import { google } from 'googleapis';

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
    // Parse Google credentials from environment variable
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    
    // Create JWT auth client
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/calendar.readonly']
    );

    const calendar = google.calendar({ version: 'v3', auth });

    const { action, params } = req.body;

    switch (action) {
      case 'listEvents': {
        const { timeMin, timeMax, maxResults = 50 } = params || {};
        
        const response = await calendar.events.list({
          calendarId: 'primary',
          timeMin: timeMin || new Date().toISOString(),
          timeMax: timeMax,
          maxResults,
          singleEvents: true,
          orderBy: 'startTime',
        });

        return res.status(200).json({
          success: true,
          events: response.data.items || []
        });
      }

      case 'getEvent': {
        const { eventId } = params;
        
        if (!eventId) {
          return res.status(400).json({ error: 'eventId required' });
        }

        const response = await calendar.events.get({
          calendarId: 'primary',
          eventId: eventId,
        });

        return res.status(200).json({
          success: true,
          event: response.data
        });
      }

      case 'findFreeTime': {
        const { timeMin, timeMax } = params || {};
        
        const response = await calendar.freebusy.query({
          requestBody: {
            timeMin: timeMin || new Date().toISOString(),
            timeMax: timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            items: [{ id: 'primary' }],
          },
        });

        return res.status(200).json({
          success: true,
          freebusy: response.data.calendars.primary
        });
      }

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Calendar API Error:', error);
    return res.status(500).json({ 
      error: 'Calendar operation failed', 
      details: error.message 
    });
  }
}
