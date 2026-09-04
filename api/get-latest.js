const axios = require('axios');

const API_LOGIN = '39bfbc119ea5941aa286';
const API_KEY = '6PR8RbXKrMh9w6b';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { folderName } = req.query;

  if (!folderName) {
    return res.status(400).json({ errorCode: 'ERR_00', error: 'يرجى كتابة اسم المجلد' });
  }

  try {
    // 1. جلب المجلدات
    const listRes = await axios.get(`https://api.streamtape.com/file/listfolder?login=${API_LOGIN}&key=${API_KEY}`);
    
    if (listRes.data.status !== 200) {
      return res.status(500).json({ errorCode: 'ERR_01', error: 'خطأ في الـ API الخاص بـ Streamtape', details: listRes.data.msg });
    }

    const folders = listRes.data.result.folders || [];
    const targetFolder = folders.find(f => f.name.trim().toLowerCase() === folderName.trim().toLowerCase());
    let targetFolderId = targetFolder ? targetFolder.id : null;

    // 2. جلب الملفات
    const filesRes = await axios.get(`https://api.streamtape.com/file/listfolder?login=${API_LOGIN}&key=${API_KEY}${targetFolderId ? `&folder=${targetFolderId}` : ''}`);
    const files = filesRes.data.result.files || [];

    if (files.length === 0) {
      return res.status(404).json({ errorCode: 'ERR_02', error: `لم يتم العثور على ملفات داخل: (${folderName})` });
    }

    files.sort((a, b) => b.ctime - a.ctime);
    const latestFile = files[0];

    // إرجاع رابط الصفحة + رابط الـ Stream) لاستخراج التفكيك من جهاز المستخدم مباشرة
    return res.status(200).json({
      success: true,
      fileName: latestFile.name,
      fileId: latestFile.id,
      pageUrl: latestFile.link // الرابط المباشر للملف المعطى من الـ API
    });

  } catch (error) {
    return res.status(500).json({ errorCode: 'ERR_99', error: 'خطأ في السيرفر', details: error.message });
  }
}
