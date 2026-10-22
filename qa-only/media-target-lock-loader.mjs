// Guest-only Node22 hook. Never configured by application/production scripts.
import {registerHooks} from 'node:module';
import {transformQaManagedMedia} from './wiring.mjs';
registerHooks({load(url,context,nextLoad){const result=nextLoad(url,context);if(!url.endsWith('/functions/src/managed-media.js'))return result;
 if(process.env.GCLOUD_PROJECT!=='demo-el-mezaen-qa'||process.env.FUNCTIONS_EMULATOR!=='true'||process.env.FIREBASE_STORAGE_EMULATOR_HOST!=='127.0.0.1:9198')throw Error('QA_MEDIA_HOOK_REQUIRES_DEMO_EMULATOR');
 return {...result,source:transformQaManagedMedia(String(result.source)).replaceAll('9199','9198')};
}});
