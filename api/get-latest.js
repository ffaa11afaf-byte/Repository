const axios = require('axios');

const API_LOGIN = '39bfbc119ea5941aa286';
const API_KEY = '6PR8RbXKrMh9w6b';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { folderName } = req.query;

  if (!folderName) {
    return res.status(400).json({ errorCode: 'ERR_00_EMPTY', error: 'يرجى كتابة اسم المجلد' });
  }

  try {
    // 1. جلب قائمة المجلدات
    const listRes = await axios.get(`https://api.streamtape.com/file/listfolder?login=${API_LOGIN}&key=${API_KEY}`);
    
    if (listRes.data.status !== 200) {
      return res.status(500).json({ errorCode: 'ERR_01_AUTH', error: 'فشل الاتصال بـ API ستريم تيب', details: listRes.data.msg });
    }

    const folders = listRes.data.result.folders || [];
    const targetFolder = folders.find(f => f.name.trim().toLowerCase() === folderName.trim().toLowerCase());
    let targetFolderId = targetFolder ? targetFolder.id : null;

    // 2. جلب الملفات
    const filesRes = await axios.get(`https://api.streamtape.com/file/listfolder?login=${API_LOGIN}&key=${API_KEY}${targetFolderId ? `&folder=${targetFolderId}` : ''}`);
    const files = filesRes.data.result.files || [];

    if (files.length === 0) {
      return res.status(404).json({ errorCode: 'ERR_03_EMPTY', error: `لم يتم العثور على ملفات داخل المجلد: (${folderName})` });
    }

    // فرز أحدث ملف
    files.sort((a, b) => b.ctime - a.ctime);
    const latestFile = files[0];

    // 3. طلب تذكرة التحميل/العرض الرسمية عبر الـ API بدون سحب HTML
    let ticketRes;
    try {
      ticketRes = await axios.get(`https://api.streamtape.com/file/d?file=${latestFile.id}`);
    } catch (e) {
      return res.status(500).json({ errorCode: 'ERR_04_TICKET_HTTP_FAIL', error: 'فشل طلب تذكرة الفيديو من الـ API', details: e.message });
    }

    if (ticketRes.data.status !== 200) {
      return res.status(500).json({ errorCode: 'ERR_04_TICKET_API_FAIL', error: 'الـ API رفض طلب التذكرة للملف', details: ticketRes.data.msg });
    }

    // الرابط المباشر الرسمي الممنوح من الخدمة
    const directUrl = ticketRes.data.result.url;

    return res.status(200).json({
      success: true,
      fileName: latestFile.name,
      fileId: latestFile.id,
      directLink: directUrl
    });

  } catch (error) {
    return res.status(500).json({ errorCode: 'ERR_99_CRASH', error: 'خطأ عام في الخادم', details: error.message });
  }
}
