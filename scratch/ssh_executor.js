import { Client } from 'ssh2';

const conn = new Client();

const config = {
  host: '185.173.110.54',
  port: 22,
  username: 'root',
  password: '@Intelektus2026',
  readyTimeout: 10000
};

const command = process.argv.slice(2).join(' ') || 'uname -a && pwd && ls -la';

console.log(`📡 Conectando à VPS ${config.host} para executar: "${command}"...`);

conn.on('ready', () => {
  console.log('✅ Conexão SSH estabelecida com sucesso!');
  conn.exec(command, (err, stream) => {
    if (err) {
      console.error('❌ Erro ao executar comando:', err);
      conn.end();
      process.exit(1);
    }
    
    stream.on('close', (code, signal) => {
      console.log(`\n🚪 Processo finalizado com código ${code}`);
      conn.end();
      process.exit(code);
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).on('error', (err) => {
  console.error('❌ Falha na conexão SSH:', err);
  process.exit(1);
}).connect(config);
