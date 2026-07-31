import html2canvas from 'html2canvas';

export function replaceOklchInCss(cssText: string): string {
  return cssText.replace(/oklch\(([^)]+)\)/g, (match, inner) => {
    try {
      const parts = inner.trim().split(/[\s/]+/);
      if (parts.length >= 3) {
        let l = parseFloat(parts[0]);
        if (parts[0].includes('%')) {
          l = l / 100;
        }
        const c = parseFloat(parts[1]);
        const h = parseFloat(parts[2]);
        
        // Convert to RGB
        const hRad = (h * Math.PI) / 180;
        const lab_a = c * Math.cos(hRad);
        const lab_b = c * Math.sin(hRad);
        
        const l_ = l + 0.3963377774 * lab_a + 0.2158037573 * lab_b;
        const m_ = l - 0.1055613458 * lab_a - 0.0638541728 * lab_b;
        const s_ = l - 0.0894841775 * lab_a - 1.2914855480 * lab_b;
        
        const l_3 = l_ * l_ * l_;
        const m_3 = m_ * m_ * m_;
        const s_3 = s_ * s_ * s_;
        
        const rL = +4.0767416621 * l_3 - 3.3077115913 * m_3 + 0.2309699292 * s_3;
        const gL = -1.2684380046 * l_3 + 2.6097574011 * m_3 - 0.3413193965 * s_3;
        const bL = -0.0041960863 * l_3 - 0.7034186147 * m_3 + 1.7076147010 * s_3;
        
        const f = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
        
        const r = Math.max(0, Math.min(255, Math.round(f(rL) * 255)));
        const g = Math.max(0, Math.min(255, Math.round(f(gL) * 255)));
        const b = Math.max(0, Math.min(255, Math.round(f(bL) * 255)));
        
        if (parts[3] !== undefined) {
          let alpha = parseFloat(parts[3]);
          if (parts[3].includes('%')) {
            alpha = alpha / 100;
          }
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return `rgb(${r}, ${g}, ${b})`;
      }
    } catch (e) {
      console.error('Error parsing oklch color:', match, e);
    }
    return match;
  });
}

export function cleanClonedDocumentStyles(clonedDoc: Document): void {
  // 1. Clean all <style> tag contents
  const styleElements = clonedDoc.getElementsByTagName('style');
  for (let i = 0; i < styleElements.length; i++) {
    const style = styleElements[i];
    if (style.textContent) {
      style.textContent = replaceOklchInCss(style.textContent);
    }
  }

  // 2. Clean inline style attributes on all elements
  const allElements = clonedDoc.getElementsByTagName('*');
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i] as HTMLElement;
    if (el.style && el.style.cssText) {
      el.style.cssText = replaceOklchInCss(el.style.cssText);
    }
  }
}

export async function safeHtml2Canvas(element: HTMLElement, options: any = {}): Promise<HTMLCanvasElement> {
  const originalOnClone = options.onclone;
  
  const customOnClone = (clonedDoc: Document, clonedElement: HTMLElement) => {
    // Clean oklch colors from style sheets and inline styles
    cleanClonedDocumentStyles(clonedDoc);
    
    // Call original onclone if provided
    if (originalOnClone) {
      originalOnClone(clonedDoc, clonedElement);
    }
  };

  return html2canvas(element, {
    ...options,
    onclone: customOnClone
  });
}
