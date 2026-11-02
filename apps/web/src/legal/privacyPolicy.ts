import type { Locale } from "../i18n/locales";

export const PRIVACY_CONTACT = "support@aegis-digi.online";
export const PRIVACY_UPDATED = "2026-10-29";

export interface PrivacySection {
  id: string;
  heading: string;
  paragraphs?: string[];
  items?: string[];
}

export interface PrivacyPolicy {
  title: string;
  updated: string;
  intro: string;
  sections: PrivacySection[];
}

const en: PrivacyPolicy = {
  title: "Privacy policy",
  updated: "Last updated {date}",
  intro:
    "Aegis is a free, fan-made Digimon card game. This page explains what data Aegis keeps, why, and what you can do about it. Questions go to {contact}.",
  sections: [
    {
      id: "collect",
      heading: "What we keep",
      items: [
        "Account: your display name, avatar, and how you sign in. Email sign-in keeps your email address; Discord sign-in keeps your Discord user ID and avatar.",
        "Game data: your saved decks, match results, statistics, recent matches, and the list of replays you saved.",
        "Reports you send: bug and feedback reports, including the match details you attach. They can be copied to our public issue tracker on GitHub without your email address.",
        "Technical data: server logs and match logs, including IP addresses, used to keep the game running, stop abuse, and fix bugs.",
        "Error reports: when the game breaks in your browser, it sends us the error message, the code location (stack), your browser user agent, the game version, and the match ID if you were in a match. We store these reports on Aegis servers and use them only to fix bugs.",
        "On your device: a sign-in cookie and your interface preferences. We use no advertising or analytics trackers.",
      ],
    },
    {
      id: "google-drive",
      heading: "Google Drive",
      paragraphs: [
        "You can choose to save replays in your own Google Drive. Aegis asks only for the drive.file permission: it can create files in an “Aegis Replays” folder and open the files it created. It cannot see any other file in your Drive.",
        "The Google access token stays in your browser and is never sent to our servers. Our servers keep only the Drive file ID and the match summary, so your replay list appears on every device where you sign in.",
        "If you make a replay public, Aegis sets that file to “anyone with the link can view” and our server delivers it to people who open the link. Making it private again removes that access.",
        "You can disconnect Google Drive in Settings, or revoke access in your Google account. Files already saved stay in your Drive until you delete them.",
        "Aegis's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.",
      ],
    },
    {
      id: "profile-pictures",
      heading: "Profile pictures",
      paragraphs: [
        "When you upload a profile picture, our server sends the image to OpenAI's moderation service to check it for sexual or graphic violent content. Only the image is sent: no name, email, or account ID.",
        "If OpenAI cannot answer, our own server checks the picture instead. If no check works, the upload is refused and your previous picture stays.",
        "A refused picture is not stored. We keep only pictures that pass the check.",
      ],
    },
    {
      id: "use",
      heading: "How we use it",
      paragraphs: [
        "We use this data only to run Aegis: sign you in, match players, show your profile and replays, send sign-in emails, and fix problems. We do not sell data, show ads, or use your data to train AI models.",
      ],
    },
    {
      id: "retention",
      heading: "How long we keep it",
      paragraphs: [
        "Account and game data stay while your account exists. A finished match you did not save is removed from your replay list after 7 days. Logs are kept only as long as we need them to run and debug the game.",
      ],
    },
    {
      id: "choices",
      heading: "Your choices",
      paragraphs: [
        "You can edit your profile and delete decks or saved replays at any time. To get a copy of your data or delete your account, email {contact} from the address you sign in with, or tell us your Discord user.",
      ],
    },
    {
      id: "changes",
      heading: "Changes",
      paragraphs: ["If this policy changes, we update this page and the date at the top."],
    },
  ],
};

const ptBR: PrivacyPolicy = {
  title: "Política de privacidade",
  updated: "Atualizada em {date}",
  intro:
    "Aegis é um jogo de cartas Digimon gratuito, feito por fãs. Esta página explica quais dados o Aegis guarda, por quê e o que você pode fazer. Dúvidas: {contact}.",
  sections: [
    {
      id: "collect",
      heading: "O que guardamos",
      items: [
        "Conta: seu nome de exibição, avatar e forma de login. O login por e-mail guarda seu endereço de e-mail; o login pelo Discord guarda seu ID de usuário e avatar do Discord.",
        "Dados de jogo: seus decks salvos, resultados de partidas, estatísticas, partidas recentes e a lista de replays que você salvou.",
        "Relatos que você envia: relatos de bugs e feedback, incluindo os detalhes da partida anexados. Eles podem ser copiados para nosso rastreador público de problemas no GitHub, sem seu e-mail.",
        "Dados técnicos: logs do servidor e das partidas, incluindo endereços IP, usados para manter o jogo funcionando, impedir abusos e corrigir bugs.",
        "Relatórios de erro: quando o jogo falha no seu navegador, ele nos envia a mensagem de erro, o local no código (stack), o user agent do navegador, a versão do jogo e o ID da partida, se você estava em uma. Guardamos esses relatórios nos servidores do Aegis e os usamos só para corrigir bugs.",
        "No seu dispositivo: um cookie de login e suas preferências de interface. Não usamos rastreadores de anúncios ou de análise.",
      ],
    },
    {
      id: "google-drive",
      heading: "Google Drive",
      paragraphs: [
        "Você pode escolher salvar replays no seu próprio Google Drive. O Aegis pede apenas a permissão drive.file: ele pode criar arquivos numa pasta “Aegis Replays” e abrir os arquivos que ele criou. Ele não vê nenhum outro arquivo do seu Drive.",
        "O token de acesso do Google fica no seu navegador e nunca é enviado aos nossos servidores. Nossos servidores guardam apenas o ID do arquivo no Drive e o resumo da partida, para sua lista de replays aparecer em todo dispositivo onde você entrar.",
        "Se você tornar um replay público, o Aegis define o arquivo como “qualquer pessoa com o link pode ver” e nosso servidor o entrega a quem abrir o link. Torná-lo privado de novo remove esse acesso.",
        "Você pode desconectar o Google Drive nas Configurações ou revogar o acesso na sua Conta do Google. Os arquivos já salvos ficam no seu Drive até você apagá-los.",
        "O uso e a transferência, pelo Aegis, de informações recebidas das APIs do Google seguem a Política de Dados do Usuário dos Serviços de API do Google, incluindo os requisitos de Uso Limitado.",
      ],
    },
    {
      id: "profile-pictures",
      heading: "Fotos de perfil",
      paragraphs: [
        "Quando você envia uma foto de perfil, nosso servidor manda a imagem ao serviço de moderação da OpenAI para verificar se há conteúdo sexual ou de violência explícita. Só a imagem é enviada: sem nome, e-mail ou ID da conta.",
        "Se a OpenAI não responder, nosso próprio servidor verifica a foto. Se nenhuma verificação funcionar, o envio é recusado e sua foto anterior continua.",
        "Uma foto recusada não é guardada. Guardamos só as fotos aprovadas na verificação.",
      ],
    },
    {
      id: "use",
      heading: "Como usamos",
      paragraphs: [
        "Usamos esses dados só para operar o Aegis: fazer seu login, formar partidas, mostrar seu perfil e replays, enviar e-mails de login e corrigir problemas. Não vendemos dados, não exibimos anúncios e não usamos seus dados para treinar modelos de IA.",
      ],
    },
    {
      id: "retention",
      heading: "Por quanto tempo guardamos",
      paragraphs: [
        "Dados de conta e de jogo ficam enquanto sua conta existir. Uma partida terminada que você não salvou sai da sua lista de replays após 7 dias. Logs ficam só pelo tempo necessário para operar e depurar o jogo.",
      ],
    },
    {
      id: "choices",
      heading: "Suas escolhas",
      paragraphs: [
        "Você pode editar seu perfil e apagar decks ou replays salvos a qualquer momento. Para receber uma cópia dos seus dados ou excluir sua conta, escreva para {contact} a partir do e-mail que você usa para entrar, ou informe seu usuário do Discord.",
      ],
    },
    {
      id: "changes",
      heading: "Mudanças",
      paragraphs: ["Se esta política mudar, atualizamos esta página e a data no topo."],
    },
  ],
};

const es: PrivacyPolicy = {
  title: "Política de privacidad",
  updated: "Actualizada el {date}",
  intro:
    "Aegis es un juego de cartas Digimon gratuito hecho por fans. Esta página explica qué datos guarda Aegis, por qué y qué puedes hacer. Dudas: {contact}.",
  sections: [
    {
      id: "collect",
      heading: "Qué guardamos",
      items: [
        "Cuenta: tu nombre visible, avatar y forma de inicio de sesión. El inicio por correo guarda tu dirección de correo; el inicio con Discord guarda tu ID de usuario y avatar de Discord.",
        "Datos de juego: tus mazos guardados, resultados de partidas, estadísticas, partidas recientes y la lista de replays que guardaste.",
        "Reportes que envías: reportes de errores y comentarios, incluidos los detalles de la partida adjuntos. Pueden copiarse a nuestro gestor público de incidencias en GitHub, sin tu correo.",
        "Datos técnicos: registros del servidor y de partidas, incluidas direcciones IP, usados para mantener el juego, evitar abusos y corregir errores.",
        "Informes de errores: cuando el juego falla en tu navegador, nos envía el mensaje de error, la ubicación en el código (stack), el user agent de tu navegador, la versión del juego y el ID de la partida si estabas en una. Guardamos estos informes en los servidores de Aegis y los usamos solo para corregir errores.",
        "En tu dispositivo: una cookie de sesión y tus preferencias de interfaz. No usamos rastreadores de publicidad ni de analítica.",
      ],
    },
    {
      id: "google-drive",
      heading: "Google Drive",
      paragraphs: [
        "Puedes guardar replays en tu propio Google Drive. Aegis solo pide el permiso drive.file: puede crear archivos en una carpeta “Aegis Replays” y abrir los archivos que creó. No puede ver ningún otro archivo de tu Drive.",
        "El token de acceso de Google se queda en tu navegador y nunca se envía a nuestros servidores. Nuestros servidores solo guardan el ID del archivo en Drive y el resumen de la partida, para que tu lista de replays aparezca en cada dispositivo donde inicies sesión.",
        "Si haces público un replay, Aegis configura el archivo como “cualquier persona con el enlace puede verlo” y nuestro servidor lo entrega a quien abra el enlace. Volverlo privado elimina ese acceso.",
        "Puedes desconectar Google Drive en Ajustes o revocar el acceso en tu cuenta de Google. Los archivos ya guardados siguen en tu Drive hasta que los borres.",
        "El uso y la transferencia por parte de Aegis de la información recibida de las API de Google cumplen la Política de Datos de Usuario de los Servicios de API de Google, incluidos los requisitos de Uso Limitado.",
      ],
    },
    {
      id: "profile-pictures",
      heading: "Fotos de perfil",
      paragraphs: [
        "Cuando subes una foto de perfil, nuestro servidor envía la imagen al servicio de moderación de OpenAI para comprobar si tiene contenido sexual o de violencia explícita. Solo se envía la imagen: sin nombre, correo ni ID de cuenta.",
        "Si OpenAI no responde, nuestro propio servidor revisa la foto. Si ninguna revisión funciona, la subida se rechaza y tu foto anterior se mantiene.",
        "Una foto rechazada no se guarda. Solo guardamos las fotos que pasan la revisión.",
      ],
    },
    {
      id: "use",
      heading: "Cómo lo usamos",
      paragraphs: [
        "Usamos estos datos solo para operar Aegis: iniciar tu sesión, emparejar jugadores, mostrar tu perfil y replays, enviar correos de inicio de sesión y corregir problemas. No vendemos datos, no mostramos anuncios ni usamos tus datos para entrenar modelos de IA.",
      ],
    },
    {
      id: "retention",
      heading: "Cuánto tiempo lo guardamos",
      paragraphs: [
        "Los datos de cuenta y de juego se mantienen mientras exista tu cuenta. Una partida terminada que no guardaste sale de tu lista de replays tras 7 días. Los registros se guardan solo el tiempo necesario para operar y depurar el juego.",
      ],
    },
    {
      id: "choices",
      heading: "Tus opciones",
      paragraphs: [
        "Puedes editar tu perfil y borrar mazos o replays guardados cuando quieras. Para recibir una copia de tus datos o eliminar tu cuenta, escribe a {contact} desde el correo con el que inicias sesión, o indícanos tu usuario de Discord.",
      ],
    },
    {
      id: "changes",
      heading: "Cambios",
      paragraphs: ["Si esta política cambia, actualizamos esta página y la fecha de arriba."],
    },
  ],
};

const it: PrivacyPolicy = {
  title: "Informativa sulla privacy",
  updated: "Aggiornata il {date}",
  intro:
    "Aegis è un gioco di carte Digimon gratuito creato dai fan. Questa pagina spiega quali dati conserva Aegis, perché e cosa puoi fare. Domande: {contact}.",
  sections: [
    {
      id: "collect",
      heading: "Cosa conserviamo",
      items: [
        "Account: nome visualizzato, avatar e modalità di accesso. L’accesso via email conserva il tuo indirizzo email; l’accesso con Discord conserva il tuo ID utente e l’avatar Discord.",
        "Dati di gioco: i mazzi salvati, i risultati delle partite, le statistiche, le partite recenti e l’elenco dei replay che hai salvato.",
        "Segnalazioni che invii: segnalazioni di bug e feedback, inclusi i dettagli della partita allegati. Possono essere copiate nel nostro issue tracker pubblico su GitHub, senza il tuo indirizzo email.",
        "Dati tecnici: log del server e delle partite, inclusi gli indirizzi IP, usati per far funzionare il gioco, prevenire abusi e correggere bug.",
        "Segnalazioni di errore: quando il gioco si blocca nel tuo browser, ci invia il messaggio di errore, la posizione nel codice (stack), lo user agent del browser, la versione del gioco e l’ID della partita, se eri in partita. Conserviamo queste segnalazioni sui server di Aegis e le usiamo solo per correggere bug.",
        "Sul tuo dispositivo: un cookie di accesso e le preferenze dell’interfaccia. Non usiamo tracker pubblicitari o di analisi.",
      ],
    },
    {
      id: "google-drive",
      heading: "Google Drive",
      paragraphs: [
        "Puoi scegliere di salvare i replay nel tuo Google Drive. Aegis chiede solo il permesso drive.file: può creare file in una cartella “Aegis Replays” e aprire i file che ha creato. Non può vedere nessun altro file del tuo Drive.",
        "Il token di accesso Google resta nel tuo browser e non viene mai inviato ai nostri server. I nostri server conservano solo l’ID del file su Drive e il riepilogo della partita, così l’elenco dei replay appare su ogni dispositivo in cui accedi.",
        "Se rendi pubblico un replay, Aegis imposta il file come “chiunque abbia il link può visualizzarlo” e il nostro server lo consegna a chi apre il link. Renderlo di nuovo privato rimuove questo accesso.",
        "Puoi scollegare Google Drive nelle Impostazioni o revocare l’accesso dal tuo account Google. I file già salvati restano nel tuo Drive finché non li elimini.",
        "L’uso e il trasferimento da parte di Aegis delle informazioni ricevute dalle API di Google rispettano le Norme sui dati utente dei servizi API di Google, inclusi i requisiti di Uso limitato.",
      ],
    },
    {
      id: "profile-pictures",
      heading: "Immagini del profilo",
      paragraphs: [
        "Quando carichi un’immagine del profilo, il nostro server invia l’immagine al servizio di moderazione di OpenAI per verificare se contiene contenuti sessuali o di violenza esplicita. Viene inviata solo l’immagine: nessun nome, email o ID dell’account.",
        "Se OpenAI non risponde, il nostro server controlla l’immagine. Se nessun controllo funziona, il caricamento viene rifiutato e l’immagine precedente resta.",
        "Un’immagine rifiutata non viene conservata. Conserviamo solo le immagini che superano il controllo.",
      ],
    },
    {
      id: "use",
      heading: "Come li usiamo",
      paragraphs: [
        "Usiamo questi dati solo per far funzionare Aegis: farti accedere, abbinare i giocatori, mostrare profilo e replay, inviare email di accesso e risolvere problemi. Non vendiamo dati, non mostriamo pubblicità e non usiamo i tuoi dati per addestrare modelli di IA.",
      ],
    },
    {
      id: "retention",
      heading: "Per quanto tempo",
      paragraphs: [
        "I dati dell’account e di gioco restano finché esiste il tuo account. Una partita terminata che non hai salvato esce dall’elenco dei replay dopo 7 giorni. I log restano solo per il tempo necessario a gestire e correggere il gioco.",
      ],
    },
    {
      id: "choices",
      heading: "Le tue scelte",
      paragraphs: [
        "Puoi modificare il profilo ed eliminare mazzi o replay salvati in qualsiasi momento. Per ricevere una copia dei tuoi dati o eliminare l’account, scrivi a {contact} dall’indirizzo con cui accedi, oppure indicaci il tuo utente Discord.",
      ],
    },
    {
      id: "changes",
      heading: "Modifiche",
      paragraphs: ["Se questa informativa cambia, aggiorniamo questa pagina e la data in alto."],
    },
  ],
};

export const PRIVACY_POLICIES: Record<Locale, PrivacyPolicy> = {
  en,
  "pt-BR": ptBR,
  es,
  it,
  ko: en,
  ja: en,
  "zh-CN": en,
  "zh-TW": en,
  fr: en,
  de: en,
  id: en,
};
