(function () {
  const tags = [
    ["b", "Ж", "Жирный"],
    ["i", "К", "Курсив"],
    ["u", "Ч", "Подчёркнутый"],
  ];

  function format(textarea, tag) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end);
    const open = `[${tag}]`;
    const close = `[/${tag}]`;
    textarea.setRangeText(`${open}${selected}${close}`, start, end, "select");
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function enhance(root = document) {
    root.querySelectorAll("textarea").forEach((textarea) => {
      if (textarea.dataset.richTextReady) {
        textarea._richTextRefresh?.();
        return;
      }
      textarea.dataset.richTextReady = "true";
      const toolbar = document.createElement("div");
      toolbar.className = "rich-text-toolbar";
      const preview = document.createElement("div");
      preview.className = "rich-text-preview";
      const escapeHtml = (value) =>
        String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
      const updatePreview = () => {
        preview.innerHTML = render(textarea.value, escapeHtml);
        preview.classList.toggle("empty", !textarea.value.trim());
      };
      tags.forEach(([tag, label, title]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.richTextTag = tag;
        button.title = title;
        button.textContent = label;
        button.addEventListener("click", () => format(textarea, tag));
        toolbar.append(button);
      });
      textarea.before(toolbar);
      textarea.after(preview);
      textarea.addEventListener("input", updatePreview);
      textarea.addEventListener("focus", updatePreview);
      textarea._richTextRefresh = updatePreview;
      updatePreview();
    });
  }

  function render(value, escapeHtml) {
    let html = escapeHtml(value || "").replace(/\r?\n/g, "<br>");
    html = html.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, "<strong>$1</strong>");
    html = html.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, "<em>$1</em>");
    html = html.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, "<u>$1</u>");
    return html;
  }

  window.RichText = { enhance, render };
  document.addEventListener("DOMContentLoaded", () => {
    enhance();
    new MutationObserver((mutations) =>
      mutations.forEach((mutation) =>
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) enhance(node);
        }),
      ),
    ).observe(document.body, { childList: true, subtree: true });
  });
})();
