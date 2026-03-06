const https = require('https');

const url = 'https://ubefvllgudeoydzvefbh.supabase.co/auth/v1/settings';

console.log(`Testing connectivity to: ${url}`);

https.get(url, (res) => {
    console.log(`Status Code: ${res.statusCode}`);
    res.on('data', (d) => {
        process.stdout.write(d);
    });
}).on('error', (e) => {
    console.error(`Error: ${e.message}`);
});
