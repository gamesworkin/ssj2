/* Impressão de documentos: logos são imagens, nunca gráficos de fundo. */
const IMAGE_TIMEOUT = 20000;

function aguardarImagem(img) {
  return new Promise((resolve, reject) => {
    let timer;
    const terminar = (error) => {
      clearTimeout(timer);
      img.removeEventListener("load", carregou);
      img.removeEventListener("error", falhou);
      if (error) reject(error); else resolve();
    };
    const carregou = () => terminar(img.naturalWidth ? null : new Error("Imagem vazia"));
    const falhou = () => terminar(new Error("Não foi possível carregar a logo"));
    img.addEventListener("load", carregou);
    img.addEventListener("error", falhou);
    timer = setTimeout(() => terminar(new Error("Tempo de carregamento da logo excedido")), IMAGE_TIMEOUT);
    if (img.complete) carregou();
  }).then(async () => {
    if (img.decode) await img.decode();
  });
}

async function incorporarImagem(img) {
  const original = img.src;
  // Links acessíveis por CORS são incorporados para a impressão não depender
  // de outro acesso ao servidor. Links sem CORS ainda funcionam como <img>.
  if (!original.startsWith("data:")) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT);
    try {
      const response = await fetch(original, { signal: controller.signal });
      if (!response.ok) throw new Error("Logo indisponível");
      const blob = await response.blob();
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Falha ao incorporar logo"));
        reader.readAsDataURL(blob);
      });
      if (typeof data === "string") img.src = data;
    } catch (_) {
      // Não remover a imagem nem imprimir sem ela: validar o carregamento abaixo.
      img.src = original;
    } finally { clearTimeout(timer); }
  }
  await aguardarImagem(img);
  // Incorporar pixels em PNG evita dependência de rede e diferenças no
  // tratamento da transparência pelos drivers de impressão.
  try {
    const canvas = img.ownerDocument.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const png = canvas.toDataURL("image/png");
      img.src = png;
      await aguardarImagem(img);
    }
  } catch (_) {
    // Imagens externas sem CORS não permitem canvas, mas imprimem como imagem.
    await aguardarImagem(img);
  }
}

export function prepararImpressao(w) {
  const doc = w.document;
  const imprimirNativo = w.print.bind(w);
  let pronto = false;
  let preparando = false;
  doc.body.classList.add("doc-print-blocked");
  const barra = doc.createElement("div");
  barra.className = "doc-print-controls";
  const status = doc.createElement("span");
  status.setAttribute("role", "status");
  const botao = doc.createElement("button");
  botao.type = "button";
  botao.textContent = "Imprimir / salvar PDF";
  botao.disabled = true;
  barra.append(status, botao);
  doc.body.prepend(barra);
  const aviso = doc.createElement("p");
  aviso.className = "doc-print-warning";
  aviso.textContent = "Impressão indisponível: aguarde o carregamento das logos ou corrija a imagem cadastrada e emita novamente o recibo.";
  doc.body.prepend(aviso);

  const imprimir = () => {
    if (!pronto || w.closed) return;
    w.focus();
    imprimirNativo();
  };
  w.print = imprimir;

  const preparar = async () => {
    if (preparando || w.closed) return;
    preparando = true;
    pronto = false;
    botao.disabled = true;
    doc.body.classList.add("doc-print-blocked");
    status.textContent = "Preparando logos para impressão…";
    try {
      await Promise.all(Array.from(doc.querySelectorAll("img")).map(incorporarImagem));
      if (doc.fonts) await doc.fonts.ready;
      if (w.closed) return;
      await new Promise((resolve) => w.requestAnimationFrame(() => w.requestAnimationFrame(resolve)));
      pronto = true;
      doc.body.classList.remove("doc-print-blocked");
      status.textContent = "Documento pronto para impressão.";
      botao.textContent = "Imprimir / salvar PDF";
      botao.onclick = imprimir;
      botao.disabled = false;
      imprimir();
    } catch (_) {
      if (w.closed) return;
      status.textContent = "Uma logo não carregou. Confira o link ou envie a imagem por upload; a impressão foi bloqueada para não sair sem logo.";
      botao.textContent = "Tentar carregar novamente";
      botao.onclick = preparar;
      botao.disabled = false;
    } finally { preparando = false; }
  };
  void preparar();
}