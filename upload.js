require('dotenv').config();
const qiniu = require('qiniu');
const path = require('path');

// 从环境变量获取密钥
const accessKey = process.env.AK;
const secretKey = process.env.SK;
const bucket = 'acceptance-test';

// 获取命令行中的文件路径参数
const localFilePath = process.argv[2];
if (!localFilePath) {
  console.error('Error: No file path provided.');
  process.exit(1);
}

const key = `replay/${path.basename(localFilePath)}`;  // 在上传后的文件名前加上'replay/'

// 配置上传策略允许覆盖同名文件
const options = {
  scope: `${bucket}:${key}`  // 允许覆盖同名文件
};
const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
const putPolicy = new qiniu.rs.PutPolicy(options);
const uploadToken = putPolicy.uploadToken(mac);

// 七牛云上传配置
const config = new qiniu.conf.Config();
config.regionsProvider = qiniu.httpc.Region.fromRegionId('as0'); // 根据你的存储区域选择对应的zone

const resumeUploader = new qiniu.resume_up.ResumeUploader(config);
const putExtra = new qiniu.form_up.PutExtra();
// 文件分片上传（断点续传）
putExtra.version = 'v2';
// 上传进度
putExtra.progressCallback = (uploadedBytes, totalBytes) => {
  console.log(`Uploaded: ${uploadedBytes} / ${totalBytes} (${(uploadedBytes / totalBytes * 100).toFixed(2)}%)`);
};

// 文件上传函数
function uploadFile() {
  console.log(`Uploading file: ${localFilePath}`);
  resumeUploader.putFile(uploadToken, key, localFilePath, putExtra, (err, body, info) => {
    if (err) {
      console.error('Upload Error:', err);
      return;
    }
    if (info.statusCode === 200) {
      console.log("Upload successful:", body);
    } else {
      console.log("Failed to upload:", info);
    }
  });
}

// 调用上传
uploadFile();
