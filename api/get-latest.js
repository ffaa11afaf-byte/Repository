const axios = require('axios');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ errorCode: 'ERR_00_EMPTY_URL', error: 'يرجى إدخال رابط الحلقة' });
  }

  try {
    // 1. تنظيف وتجهيز الرابط
    let cleanUrl = url.trim();
    // تحويل روابط المعاينة /e/ إلى روابط العرض الأساسية /v/ لضمان وجود كود التفكيك
    if (cleanUrl.includes('/e/')) {
      cleanUrl = cleanUrl.replace('/e/', '/v/');
    }

    // 2. سحب كود الـ HTML للصفحة
    let htmlRes;
    try {
      htmlRes = await axios.get(cleanUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
    } catch (e) {
      return res.status(500).json({ 
        errorCode: 'ERR_01_FETCH_HTML_FAIL', 
        error: 'فشل جلب صفحة الحلقة (تأكد من صحة الرابط أو قد يكون IP السيرفر محظوراً)', 
        details: e.message 
      });
    }

    // 3. تفكيك كود robotlink عبر Regex
    const html = htmlRes.data;
    const regex = /document\.getElementById\('robotlink'\)\.innerHTML = '(.*?)'\+ \('(.*?)'\)/;
    const match = html.match(regex);

    if (!match) {
      return res.status(404).json({ 
        errorCode: 'ERR_02_REGEX_FAIL', 
        error: 'تعذر العثور على كود التشفير داخل الصفحة (قد تكون الحلقة محذوفة أو تم إظهار كابتشا)' 
      });
    }

    const part1 = match[1];
    const part2 = match[2].replace(/['\+ ]/g, '');
    const getVideoUrl = `https:${part1}${part2}`;

    // 4. التقاط رابط التوجيه النهائي (302 Redirect)
    let redirectRes;
    try {
      redirectRes = await axios.get(getVideoUrl, {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
    } catch (e) {
      return res.status(500).json({ 
        errorCode: 'ERR_03_REDIRECT_FAIL', 
        error: 'فشل التقاط رابط إعادة التوجيه النهائي', 
        details: e.message 
      });
    }

    const directLink = redirectRes.headers.location;

    if (!directLink) {
      return res.status(500).json({ errorCode: 'ERR_04_NO_DIRECT_LINK', error: 'لم يتم العثور على رابط التوجيه المباشر' });
    }

    return res.status(200).json({
      success: true,
      directLink: directLink
    });

  } catch (globalError) {
    return res.status(500).json({ errorCode: 'ERR_99_CRASH', error: 'خطأ عام في الخادم', details: globalError.message });
  }
}
