const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
  host: '101.43.8.77',
  port: 22,
  username: 'ubuntu',
  privateKey: fs.readFileSync(path.join(__dirname, 'web3zhu.pem')),
  // password: 'your-password' // 如果不使用私钥，则可以使用密码
};

const localFilePath = path.join(__dirname, 'price.db');
const remoteFilePath = '/var/www/ckbMA/price.db';

const conn = new Client();

conn.on('ready', () => {
  console.log('Client :: ready');
  conn.sftp((err, sftp) => {
    if (err) throw err;

    // 上传文件，替换远程文件
    sftp.fastPut(localFilePath, remoteFilePath, (err) => {
      if (err) {
        console.error('Upload Error:', err);
      } else {
        console.log('Upload successful to:', remoteFilePath);
      }
      conn.end(); // 关闭连接
    });
  });
}).on('error', (err) => {
  console.error('Connection Error:', err);
}).connect(config);
