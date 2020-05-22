import store$ from "../observables/store";
import router$ from "../observables/router";
import Layout from "./Layout";
import DetailToolbar from "./DetailToolbar";
import {
  Main,
  Header,
  SenderInfo,
  RecipientInfo,
  Body,
} from "../elements/Detail";

const Detail = ({ folder, id }) => {
  const { state: allMails } = store$;
  const mail = allMails[folder].find((item) => item.id === id);

  if (!mail) {
    router$.redirect("/" + folder);
    return (
      // use-transform
      p("Redirecting...")
    );
  }

  const {
    subject,
    senderName = "(no name)",
    senderEmail = "(no email)",
    recipientName = "(no name)",
    recipientEmail = "(no email)",
    content,
  } = mail;

  const senderInfo = `${senderName}&nbsp;&lt;${senderEmail}&gt;`;
  const recipientInfo = `To: ${recipientName}&nbsp;&lt;${recipientEmail}&gt;`;

  return (
    // use-transform
    Layout([
      DetailToolbar((folder = folder), (id = id)),
      Main([
        Header(subject),
        SenderInfo((innerHTML = senderInfo)),
        RecipientInfo((innerHTML = recipientInfo)),
        Body(content),
      ]),
    ])
  );
};

export default Detail;
