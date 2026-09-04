const axios = require('axios');

const API_LOGIN = '39bfbc119ea5941aa286';
const API_KEY = '6PR8RbXKrMh9w6b';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { folderName } = req.query;

  if (!folderName) {
    return res.status(400).json({ errorCode: 'ERR_00_NO_INPUT', error: 'يرجى إدخال اسم المجلد' });
  }

  try {
    // 1. جلب المجلدات عبر الـ API
    let listRes;
    try {
      listRes = await axios.get(`https://api.streamtape.com/file/listfolder?login=${API_LOGIN}&key=${API_KEY}`);
    } catch (e) {
      return res.status(500).json({ errorCode: 'ERR_01_API_LIST_FAIL', error: 'فشل الاتصال بـ API ستريم تيب', details: e.message });
    }

    if (listRes.data.status !== 200) {
      return res.status(500).json({ errorCode: 'ERR_01_API_AUTH_ERROR', error: 'بيانات اعتماد الـ API غير صحيحة', details: listRes.data.msg });
    }

    const folders = listRes.data.result.folders || [];
    const targetFolder = folders.find(f => f.name.trim().toLowerCase() === folderName.trim().toLowerCase());
    let targetFolderId = targetFolder ? targetFolder.id : null;

    // 2. جلب الملفات داخل المجلد
    let filesRes;
    try {
      filesRes = await axios.get(`https://api.streamtape.com/file/listfolder?login=${API_LOGIN}&key=${API_KEY}${targetFolderId ? `&folder=${targetFolderId}` : ''}`);
    } catch (e) {
      return res.status(500).json({ errorCode: 'ERR_02_FILES_FETCH_FAIL', error: 'فشل جلب ملفات المجلد', details: e.message });
    }

    const files = filesRes.data.result.files || [];

    if (files.length === 0) {
      return res.status(404).json({ errorCode: 'ERR_03_EMPTY_FOLDER', error: `لم يتم العثور على ملفات داخل المجلد: (${folderName})` });
    }

    // فرز جلب أحدث ملف
    files.sort((a, b) => b.ctime - a.ctime);
    const latestFile = files[0];

    // استبدال النطاق الرئيسي بالنطاق المستقر لتفادي 404
    const pageUrl = `https://streamtape.to/v/${latestFile.id}`;

    // 3. جلب كود الصفحة من السيرفر
    let htmlRes;
    try {
      htmlRes = await axios.get(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
    } catch (e) {
      return res.status(500).json({ errorCode: 'ERR_04_HTML_SCRAPE_FAIL', error: 'فشل سحب كود HTML من صفحة الحلقة', details: e.message });
    }

    // 4. تفكيك التشفير عبر Regex
    const html = htmlRes.data;
    const regex = /document\.getElementById\('robotlink'\)\.innerHTML = '(.*?)'\+ \('(.*?)'\)/;
    const match = html.match(regex);

    if (!match) {
      return res.status(404).json({ errorCode: 'ERR_05_ROBOTLINK_NOT_FOUND', error: 'تعذر العثور على كود التشفير داخل الصفحة', fileName: latestFile.name });
    }

    const part1 = match[1];
    const part2 = match[2].replace(/['\+ ]/g, '');
    const getVideoUrl = `https:${part1}${part2}`;

    // 5. جلب الرابط المباشر 302
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
      return res.status(500).json({ errorCode: 'ERR_06_REDIRECT_CAPTURE_FAIL', error: 'فشل الحصول على رابط التحويل النهائي', details: e.message });
    }

    const directLink = redirectRes.headers.location;

    return res.status(200).json({
      success: true,
      fileName: latestFile.name,
      directLink: directLink
    });

  } catch (globalError) {
    return res.status(500).json({ errorCode: 'ERR_99_SERVER_CRASH', error: 'خطأ رئيسي في السيرفر', details: globalError.message });
  }
}
