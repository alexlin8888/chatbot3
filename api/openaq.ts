export default async function handler(req: any, res: any) {
  // 設定 CORS 標頭
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

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
        searchParams.append(key, value[0]);
      }
    });

    // 建構完整的 URL - 支援嵌套路徑 (如 locations/123/latest)
    const baseUrl = 'https://api.openaq.org/v3';
    const queryString = searchParams.toString();
    const fullUrl = queryString 
      ? `${baseUrl}/${endpoint}?${queryString}`
      : `${baseUrl}/${endpoint}`;
    
    console.log('=== API Proxy Debug ===');
    console.log('Endpoint:', endpoint);
    console.log('Query params:', queryParams);
    console.log('Full URL:', fullUrl);

    // 您的 API Key - 請確認這是有效的
    const API_KEY = process.env.OPENAQ_API_KEY || '1aedaa907545aa98f9610596b00a790661281ac64533a10ff1a02eda13866d68';

    // 呼叫 OpenAQ API - 使用正確的 header 格式
    const apiResponse = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY,
        'Accept': 'application/json',
        'User-Agent': 'AeroGuard-App/1.0'
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
        body: errorText,
        url: fullUrl
      });
      
      // 如果是 401/403,可能是 API key 問題
      if (apiResponse.status === 401 || apiResponse.status === 403) {
        return res.status(401).json({ 
          error: 'Invalid API key',
          message: 'Please check your OpenAQ API key at https://openaq.org/',
          hint: 'Set OPENAQ_API_KEY environment variable or update the hardcoded key'
        });
      }
      
      return res.status(apiResponse.status).json({ 
        error: 'OpenAQ API request failed',
        status: apiResponse.status,
        message: errorText || apiResponse.statusText,
        url: fullUrl
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

  } catch (error: any) {
    console.error('=== Proxy Error ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error?.message);
    console.error('Full error:', error);

    // 提供更詳細的錯誤訊息
    return res.status(500).json({ 
      error: 'Internal server error in proxy',
      message: error instanceof Error ? error.message : 'Unknown error',
      type: error?.constructor?.name || 'Unknown',
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    });
  }
}
