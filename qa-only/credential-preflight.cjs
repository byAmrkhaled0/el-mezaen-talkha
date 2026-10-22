const fs=require('node:fs');const path=require('node:path');
(async()=>{
if(process.env.GOOGLE_APPLICATION_CREDENTIALS||process.env.google_application_credentials||process.env.FIREBASE_TOKEN)throw Error('Unexpected credential environment');
if(process.env.GCLOUD_PROJECT!=='demo-el-mezaen-qa' && process.env.GCLOUD_PROJECT!=='demo-el-mezaen-rules')throw Error('Demo project required');
if(process.env.GCE_METADATA_HOST!=='127.0.0.1:9')throw Error('Metadata lookup must remain loopback');
const root=path.resolve(__dirname,'../qa/local-host-profile');
if(path.resolve(process.env.APPDATA||'')!==root||path.resolve(process.env.XDG_CONFIG_HOME||'')!==root)throw Error('Profile discovery is not scoped');
if(fs.existsSync(path.join(root,'gcloud/application_default_credentials.json')))throw Error('ADC file found in QA profile');
const cli='D:/ELMEZAEN-QA/input/runtime/firebase';
const {configstore}=require(cli+'/lib/configstore.js');
if(configstore.get('user')||configstore.get('tokens')||configstore.get('additionalAccounts')?.length)throw Error('CLI account found');
if(await require(cli+'/lib/defaultCredentials.js').hasDefaultCredentials())throw Error('ADC still available');
console.log('PASS: no credential env, no CLI account, no ADC; metadata discovery restricted to loopback.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
