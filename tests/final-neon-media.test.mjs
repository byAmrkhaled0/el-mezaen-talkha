import test from 'node:test';import assert from 'node:assert/strict';
import {validateSiteMediaFile} from '../src/site-media-editor.js';
const image=(bytes,type)=>new File([Uint8Array.from(bytes)],'test',{type});
test('PNG MIME requires a PNG signature; spoofed SVG and JPEG are rejected',async()=>{await validateSiteMediaFile(image([137,80,78,71,13,10,26,10],'image/png'));await assert.rejects(validateSiteMediaFile(new File(['<svg/>'],'test.png',{type:'image/png'})));await assert.rejects(validateSiteMediaFile(image([255,216,255],'image/png')));});
test('JPEG and WebP signatures match their own declared format',async()=>{await validateSiteMediaFile(image([255,216,255,224],'image/jpeg'));await validateSiteMediaFile(new File(['RIFF1234WEBPVP8 '],'test.webp',{type:'image/webp'}));await assert.rejects(validateSiteMediaFile(new File(['RIFF1234WAVE'],'test.webp',{type:'image/webp'})));});
test('AVIF requires an ISO BMFF AVIF compatible brand',async()=>{await validateSiteMediaFile(new File(['0000ftypavif0000'],'test.avif',{type:'image/avif'}));await assert.rejects(validateSiteMediaFile(new File(['0000ftypheic0000'],'test.avif',{type:'image/avif'})));});
