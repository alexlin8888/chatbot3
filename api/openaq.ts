export default async function handler(req: any, res: any) {
  // 設定 CORS 標頭
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 處理 OPTIONS 請求 (CORS 預檢)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 只允許 GET 請求
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { endpoint, ...queryParams } = req.query;
    
    // 檢查是否有 endpoint 參數
    if (!endpoint || typeof endpoint !== 'string') {
      console.error('Missing endpoint parameter');
      return res.status(400).json({ error: 'Missing endpoint parameter' });
    }

    // 建構查詢字串
    const searchParams = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, value]) => {
      if (typeof value === 'string') {
        searchParams.append(key, value);
      } else if (Array.isArray(value)) {
        searchParams.append(key, value[0]); // 取第一個值
      }
    });

    // 建構完整的 URL
    const baseUrl = 'https://api.openaq.org/v3';
    const fullUrl = `${baseUrl}/${endpoint}?${searchParams.toString()}`;
    
    console.log('=== API Proxy Debug ===');
    console.log('Endpoint:', endpoint);
    console.log('Query params:', queryParams);
    console.log('Full URL:', fullUrl);

    // 呼叫 OpenAQ API
    const apiResponse = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'X-API-Key': '1aedaa907545aa98f9610596b00a790661281ac64533a10ff1a02eda13866d68',
        'User-Agent': 'AeroGuard-App/1.0',
        'Accept': 'application/json',
      },
    });

    console.log('OpenAQ Response status:', apiResponse.status);
    console.log('OpenAQ Response headers:', Object.fromEntries(apiResponse.headers.entries()));

    // 檢查回應是否成功
    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('OpenAQ API Error:', {
        status: apiResponse.status,
        statusText: apiResponse.statusText,
        body: errorText
      });
      
      return res.status(500).json({ 
        error: 'OpenAQ API request failed',
        status: apiResponse.status,
        message: errorText || apiResponse.statusText
      });
    }

    // 解析 JSON 回應
    const data = await apiResponse.json();
    console.log('Data received from OpenAQ:', {
      hasResults: !!data.results,
      resultCount: data.results?.length || 0,
      meta: data.meta
    });

    // 返回數據
    return res.status(200).json(data);

  } catch (error) {
    console.error('=== Proxy Error ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Full error:', error);

    return res.status(500).json({ 
      error: 'Internal server error in proxy',
      message: error instanceof Error ? error.message : 'Unknown error',
      type: error.constructor.name
    });
  }
}
