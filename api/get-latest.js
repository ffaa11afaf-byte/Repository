const axios = require('axios');

// بيانات اعتماد الـ API الخاصة بك
const API_LOGIN = '39bfbc119ea5941aa286';
const API_KEY = '6PR8RbXKrMh9w6b';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { folderName } = req.query;

  if (!folderName) {
    return res.status(400).json({ error: 'يرجى كتابة اسم المجلد/الملف المراد البحث عنه' });
  }

  try {
    // Step 1: استعلام الحساب لجلب قائمة المجلدات/الملفات الرئسية
    const listRes = await axios.get(`https://api.streamtape.com/file/listfolder?login=${API_LOGIN}&key=${API_KEY}`);
    
    if (listRes.data.status !== 200) {
      return res.status(500).json({ error: 'فشل الاتصال بـ Streamtape API', details: listRes.data.msg });
    }

    const folders = listRes.data.result.folders || [];
    
    // البحث عن المجلد المتطابق مع الاسم المدخل
    const targetFolder = folders.find(f => f.name.trim().toLowerCase() === folderName.trim().toLowerCase());

    let targetFolderId = null;
    if (targetFolder) {
      targetFolderId = targetFolder.id;
    }

    // Step 2: جلب المحتويات داخل المجلد المحدد (أو الجذر إذا لم يتوفر مجلد)
    const filesRes = await axios.get(`https://api.streamtape.com/file/listfolder?login=${API_LOGIN}&key=${API_KEY}${targetFolderId ? `&folder=${targetFolderId}` : ''}`);
    
    const files = filesRes.data.result.files || [];

    if (files.length === 0) {
      return res.status(404).json({ error: 'لم يتم العثور على أي ملفات/حلقات داخل هذا المجلد' });
    }

    // فرز الملفات للحصول على أحدث حلقة (استناداً إلى تاريخ التعديل/الرفع ctime)
    files.sort((a, b) => b.ctime - a.ctime);
    const latestFile = files[0];
    const streamtapePageUrl = `https://streamtape.com/v/${latestFile.id}`;

    // Step 3: سحب كود HTML وتفكيك الرابط المباشر (Robotlink Processing)
    const htmlRes = await axios.get(streamtapePageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      }
    });

    const html = htmlRes.data;
    const regex = /document\.getElementById\('robotlink'\)\.innerHTML = '(.*?)'\+ \('(.*?)'\)/;
    const match = html.match(regex);

    if (!match) {
      return res.status(404).json({ 
        error: 'تم الوصول للحلقة لكن تعذر فك تشفير الرابط المباشر. قد يكون التشفير تم تحديثه في الموقع',
        fileName: latestFile.name,
        pageUrl: streamtapePageUrl 
      });
    }

    const part1 = match[1];
    const part2 = match[2].replace(/['\+ ]/g, '');
    const getVideoUrl = `https:${part1}${part2}`;

    // Step 4: التقاط رابط التوجيه 302 للحصول على رابط tapecontent المباشر
    const redirectRes = await axios.get(getVideoUrl, {
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      }
    });

    const directLink = redirectRes.headers.location;

    return res.status(200).json({
      success: true,
      fileName: latestFile.name,
      fileId: latestFile.id,
      directLink: directLink
    });

  } catch (error) {
    return res.status(500).json({ error: 'حدث خطأ غير متوقع', details: error.message });
  }
}
