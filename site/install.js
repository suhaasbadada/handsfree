export const homebrewCommand = 'brew install --cask suhaasbadada/handsfree/handsfree';

// Clipboard writes happen only after an explicit click. Never execute commands.
export function initializeInstall(document, navigator) {
  for (const button of document.querySelectorAll('[data-copy-brew]')) {
    button.hidden = false;
    button.addEventListener('click', async () => {
      const code = document.getElementById(button.dataset.copyBrew);
      const status = button.closest('.brew-install').querySelector('.copy-status');
      try {
        await navigator.clipboard.writeText(code.textContent);
        status.textContent = 'Copied. Paste in Terminal to install.';
      } catch {
        status.textContent = 'Copy unavailable. Select and copy the command above.';
      }
    });
  }
}

if (typeof document !== 'undefined') initializeInstall(document, navigator);
