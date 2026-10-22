import './styles.css';
import './premium-components.css';
import './about-page.css';
import './global-navigation.js';
import {getLang} from './i18n.js';
const en=getLang()==='en';
for(const node of document.querySelectorAll('[data-about-ar]'))node.textContent=en?node.dataset.aboutEn:node.dataset.aboutAr;
document.title=en?'About El Mezaen | Talkha & El Mashaya':'عن المزين | طلخا والمشاية';
