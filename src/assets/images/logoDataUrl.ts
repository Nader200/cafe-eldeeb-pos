// Official Cafe Eldeeb Master Logo (Restored Original Logo from src/assets/images/Eldeeb logo.png)
import eldeebLogoPng from './Eldeeb logo.png';
import base64Txt from './eldeeb_logo_base64.txt?raw';

export const ELDEEB_ROYAL_LOGO_DATA_URL = base64Txt ? base64Txt.trim() : eldeebLogoPng;
export const ELDEEB_ROYAL_LOGO_FULL_DATA_URL = ELDEEB_ROYAL_LOGO_DATA_URL;

export default ELDEEB_ROYAL_LOGO_DATA_URL;

