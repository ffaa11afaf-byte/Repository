const axios = require('axios');

// بيانات الاعتماد الخاصة بحسابك في Streamtape
const API_LOGIN = '39bfbc119ea5941aa286';
const API_KEY = '6PR8RbXKrMh9w6b';

export default async function handler(req, res) {
  // إعداد هيدرز CORS لتسمح للواجهة بالاتصال بالـ API بدون مشاكل
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { folderName } = req.query;

  // التحقق من مدخلات البحث
  if (!folderName) {
    return res.status(400).json({ 
      errorCode: 'ERR_00_EMPTY_INPUT', 
      error: 'يرجى كتابة اسم المجلد المراد البحث عنه' 
    });
  }

  try {
    // -------------------------------------------------------------
    // [الخطوة 1]: جلب قائمة المجلدات من API ستريم تيب الرئيسي
    // -------------------------------------------------------------
    let listRes;
    try {
      listRes = await axios.get(`https://api.streamtape.com/file/listfolder?login=${API_LOGIN}&key=${API_KEY}`);
    } catch (e) {
      return res.status(500).json({ 
        errorCode: 'ERR_01_FOLDER_LIST_HTTP_FAIL', 
        error: 'فشل الاتصال بـ API المجلدات عبر الخادم', 
        details: e.message 
      });
    }

    if (listRes.data.status !== 200) {
      return res.status(500).json({ 
        errorCode: 'ERR_01_API_AUTH_FAIL', 
        error: 'خطأ في بيانات الاعتماد الخاصة بـ API ستريم تيب', 
        details: listRes.data.msg 
      });
    }

    const folders = listRes.data.result.folders || [];
    // البحث عن المجلد المطلوب بدون الحساسية لحالة الأحرف أو المسافات الزائدة
    const targetFolder = folders.find(f => f.name.trim().toLowerCase() === folderName.trim().toLowerCase());

    let targetFolderId = targetFolder ? targetFolder.id : null;

    // -------------------------------------------------------------
    // [الخطوة 2]: جلب قائمة الملفات والحلقات من داخل المجلد
    // -------------------------------------------------------------
    let filesRes;
    try {
      filesRes = await axios.get(`https://api.streamtape.com/file/listfolder?login=${API_LOGIN}&key=${API_KEY}${targetFolderId ? `&folder=${targetFolderId}` : ''}`);
    } catch (e) {
      return res.status(500).json({ 
        errorCode: 'ERR_02_FILE_LIST_HTTP_FAIL', 
        error: 'فشل جلب الملفات من داخل المجلد', 
        details: e.message 
      });
    }

    const files = filesRes.data.result.files || [];

    if (files.length === 0) {
      return res.status(404).json({ 
        errorCode: 'ERR_03_NO_FILES_FOUND', 
        error: `لم يتم العثور على أي ملفات أو حلقات داخل المجلد: (${folderName})` 
      });
    }

    // فرز الملفات للحصول على أحدث حلقة استناداً لوقت الرفع/التعديل (ctime)
    files.sort((a, b) => b.ctime - a.ctime);
    const latestFile = files[0];
    const streamtapePageUrl = `https://streamtape.com/v/${latestFile.id}`;

    // -------------------------------------------------------------
    // [الخطوة 3]: جلب كود الـ HTML لصفحة الحلقة لاستخراج التشفير
    // -------------------------------------------------------------
    let htmlRes;
    try {
      htmlRes = await axios.get(streamtapePageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
        }
      });
    } catch (e) {
      return res.status(500).json({ 
        errorCode: 'ERR_04_HTML_FETCH_FAIL', 
        error: 'فشل جلب صفحة الحلقة (قد يكون IP خادم Vercel محظوراً مؤقتاً)', 
        details: e.message 
      });
    }

    // -------------------------------------------------------------
    // [الخطوة 4]: تفكيك التشفير باستخدام Regex (تفكيك robotlink)
    // -------------------------------------------------------------
    const html = htmlRes.data;
    const regex = /document\.getElementById\('robotlink'\)\.innerHTML = '(.*?)'\+ \('(.*?)'\)/;
    const match = html.match(regex);

    if (!match) {
      return res.status(404).json({ 
        errorCode: 'ERR_05_REGEX_MISMATCH', 
        error: 'تغير نمط تشفير السكريبت في الموقع أو تم تحويل الصفحة لكابتشا', 
        fileName: latestFile.name 
      });
    }

    const part1 = match[1];
    const part2 = match[2].replace(/['\+ ]/g, '');
    const getVideoUrl = `https:${part1}${part2}`;

    // -------------------------------------------------------------
    // [الخطوة 5]: التقاط رابط التوجيه 302 للحصول على رابط tapecontent
    // -------------------------------------------------------------
    let redirectRes;
    try {
      redirectRes = await axios.get(getVideoUrl, {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
        }
      });
    } catch (e) {
      return res.status(500).json({ 
        errorCode: 'ERR_06_REDIRECT_FAIL', 
        error: 'فشل التقاط رابط إعادة التوجيه النهائي من السيرفر', 
        details: e.message 
      });
    }

    const directLink = redirectRes.headers.location;

    return res.status(200).json({
      success: true,
      fileName: latestFile.name,
      fileId: latestFile.id,
      directLink: directLink
    });

  } catch (globalError) {
    return res.status(500).json({ 
      errorCode: 'ERR_99_UNKNOWN_CRASH', 
      error: 'حدث خطأ عام غير متوقع في الخادم', 
      details: globalError.message 
    });
  }
}
