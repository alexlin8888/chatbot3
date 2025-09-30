import type { VercelRequest, VercelResponse } from '@vercel/node';

   const OPENAQ_BASE_URL = 'https://api.openaq.org/v3';
   const OPENAQ_API_KEY = process.env.VITE_OPENAQ_API_KEY || '1aedaa907545aa98f9610596b00a790661281ac64533a10ff1a02eda13866d68';

   export default async function handler(req: VercelRequest, res: VercelResponse) {
     // 設定 CORS 標頭
     res.setHeader('Access-Control-Allow-Origin', '*');
     res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
     res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

     if (req.method === 'OPTIONS') {
       return res.status(200).end();
     }

     if (req.method !== 'GET') {
       return res.status(405).json({ error: 'Method not allowed' });
     }

     try {
       const { endpoint, ...queryParams } = req.query;
       
       if (!endpoint || typeof endpoint !== 'string') {
         return res.status(400).json({ error: 'Missing endpoint parameter' });
       }

       // 構建查詢字符串
       const searchParams = new URLSearchParams();
       Object.entries(queryParams).forEach(([key, value]) => {
         if (typeof value === 'string') {
           searchParams.append(key, value);
         }
       });

       const url = `${OPENAQ_BASE_URL}/${endpoint}?${searchParams.toString()}`;
       
       const response = await fetch(url, {
         headers: {
           'X-API-Key': OPENAQ_API_KEY,
         },
       });

       if (!response.ok) {
         throw new Error(`OpenAQ API error: ${response.status}`);
       }

       const data = await response.json();
       res.status(200).json(data);
     } catch (error) {
       console.error('Proxy error:', error);
       res.status(500).json({ 
         error: 'Failed to fetch data from OpenAQ',
         message: error instanceof Error ? error.message : 'Unknown error'
       });
     }
   }
