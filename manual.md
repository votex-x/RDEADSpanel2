# Manual de Integração e Manutenção do Painel de Anúncios

Este manual documenta a estrutura de comunicação entre o **Painel de Anúncios** (Frontend) e o **Bot de Anúncios** (Backend) através do **Firebase Realtime Database**. O objetivo é fornecer um guia claro para que futuras manutenções e correções possam ser realizadas no painel sem a necessidade de uma análise profunda do código do bot.

## 1. Estrutura de Comunicação (Firebase Realtime Database)

A comunicação é centralizada em três nós principais no banco de dados: `servers`, `announcements` e `presence`.

### 1.1. Nó `servers/{GUILD_ID}`

Este nó é mantido pelo bot e contém dados essenciais do servidor Discord para o funcionamento do painel (como canais e emojis) e para o monitoramento do status do bot.

| Chave | Tipo | Descrição | Bot (Origem) | Painel (Consumo) |
| :--- | :--- | :--- | :--- | :--- |
| `last_ping` | `string` | Timestamp ISO 8601 do último ping do bot. Usado para determinar se o bot está online. | `heartbeat` task | `updateBotStatus` |
| `channels` | `array` | Lista de canais de texto disponíveis (`id`, `name`). | `on_ready` | `loadServerData` |
| `emojis` | `array` | Lista de emojis do servidor (`id`, `name`, `url`, `animated`). | `sync_server_emojis` | `loadServerData`, `updatePreview` |
| `name` | `string` | Nome do servidor. | `on_ready` | `loadServerData` |
| `members_count` | `number` | Contagem de membros do servidor. | `on_ready` | `loadServerData` |

### 1.2. Nó `announcements/{ann_id}`

Este é o nó principal onde o painel salva a configuração de um anúncio e o bot o consome para agendamento e envio.

| Chave | Tipo | Descrição | Painel (Origem) | Bot (Consumo) |
| :--- | :--- | :--- | :--- | :--- |
| `title` | `string` | Título interno do anúncio (para o painel). | `saveAnnouncement` | N/A |
| `active` | `boolean` | Status de ativação/desativação do anúncio. | `saveAnnouncement` | `schedule_announcement` |
| `server_id` | `string` | ID do servidor Discord (Hardcoded no painel como `GUILD_ID`). | `saveAnnouncement` | `send_announcement` |
| `channel_id` | `string` | ID do canal de destino. | `saveAnnouncement` | `send_announcement` |
| `schedule_type` | `string` | Modo de agendamento: `smart`, `interval`, ou `fixed`. | `saveAnnouncement` | `schedule_announcement` |
| `interval_hours` | `number` | Horas para o modo `interval`. | `saveAnnouncement` | `schedule_announcement` |
| `interval_minutes` | `number` | Minutos para o modo `interval`. | `saveAnnouncement` | `schedule_announcement` |
| `fixed_times` | `string` | Horários fixos separados por vírgula (ex: "10:00, 15:00"). | `saveAnnouncement` | `schedule_announcement` |
| `expiry_date` | `string` | Data de expiração (ISO 8601). | `saveAnnouncement` | `check_and_disable_expired_announcements` |
| `cam_mode` | `boolean` | Ativação da camuflagem. | `saveAnnouncement` | `send_announcement` |
| `cam_name` | `string` | Nome de camuflagem. | `saveAnnouncement` | `send_announcement` |
| `cam_avatar` | `string` | URL do avatar de camuflagem. | `saveAnnouncement` | `send_announcement` |
| `embed` | `object` | Objeto contendo a estrutura do embed. | `saveAnnouncement` | `create_embed_with_buttons` |
| `embed.title` | `string` | Título do embed. | `saveAnnouncement` | `create_embed_with_buttons` |
| `embed.description` | `string` | Descrição do embed. | `saveAnnouncement` | `create_embed_with_buttons` |
| `embed.color` | `string` | Cor lateral do embed (hex, ex: "#5865f2"). | `saveAnnouncement` | `create_embed_with_buttons` |
| `embed.thumbnail` | `string` | URL da thumbnail. | `saveAnnouncement` | `create_embed_with_buttons` |
| `embed.image` | `string` | URL da imagem principal. | `saveAnnouncement` | `create_embed_with_buttons` |
| `embed.footer_text` | `string` | Texto do rodapé. | `saveAnnouncement` | `create_embed_with_buttons` |
| `embed.footer_icon` | `string` | URL do ícone do rodapé. | `saveAnnouncement` | `create_embed_with_buttons` |
| `embed.fields` | `array` | Lista de campos (`name`, `value`, `inline`). | `saveAnnouncement` | `create_embed_with_buttons` |
| `embed.buttons` | `array` | Lista de botões (`label`, `url`, `style`). | `saveAnnouncement` | `create_embed_with_buttons` |
| `last_sent` | `string` | Timestamp ISO 8601 do último envio. | `send_announcement` | N/A |
| `status` | `string` | Status do anúncio (`expired`). | `check_and_disable_expired_announcements` | N/A |

## 2. Chave de Envio de Comando (Trigger)

O envio imediato de um anúncio é realizado através da chave `trigger_send`.

| Chave | Tipo | Descrição | Painel (Ação) | Bot (Listener) |
| :--- | :--- | :--- | :--- | :--- |
| `announcements/{ann_id}/trigger_send` | `ServerValue.TIMESTAMP` | O painel define esta chave com um timestamp do servidor. | `sendAnnouncement` | `db_listener` |

**Fluxo de Envio:**
1.  O painel chama `database.ref('announcements/{ann_id}/trigger_send').set(firebase.database.ServerValue.TIMESTAMP)`.
2.  O `db_listener` do bot detecta a mudança (qualquer valor verdadeiro).
3.  O bot executa a função `send_announcement(ann_id)`.
4.  Após o envio, o bot **deleta** a chave `trigger_send` (ou a define como `False`) para rearmar o trigger.

**Nota de Correção:** O painel foi corrigido para usar `ServerValue.TIMESTAMP` em vez de `true` para garantir que o listener do bot seja acionado mesmo que o valor anterior já fosse `true`. O bot foi corrigido para aceitar qualquer valor verdadeiro no `event.data`.

## 3. Variáveis de Template

O bot processa variáveis de template na descrição e título do embed antes do envio. O painel deve simular essa substituição no preview para maior precisão.

| Variável | Descrição |
| :--- | :--- |
| `{server.name}` | Nome do servidor. |
| `{server.members}` | Contagem de membros do servidor. |
| `{server.icon}` | URL do ícone do servidor. |
| `{user.name}` | Nome de exibição do usuário (se houver contexto de usuário). |
| `{user.avatar}` | URL do avatar do usuário (se houver contexto de usuário). |
| `{timestamp}` | Timestamp de envio. |

## 4. Melhorias e Correções Implementadas

As seguintes correções foram aplicadas ao painel (`script.js` e `style.css`) e ao bot (`main_updated.py`):

1.  **Correção de Envio:**
    *   **Painel (`script.js`):** A função `sendAnnouncement` agora usa `firebase.database.ServerValue.TIMESTAMP` para o `trigger_send`, garantindo que o bot detecte a mudança e inicie o envio.
    *   **Bot (`main_updated.py`):** O `db_listener` foi ajustado para reagir a qualquer valor verdadeiro em `trigger_send`.
2.  **Melhoria no Preview de Embed:**
    *   **CSS (`style.css`):** O estilo do embed foi atualizado para se assemelhar mais ao design moderno do Discord (cores, bordas, fontes, botões).
    *   **HTML/JS (`index.html`, `script.js`):** A cor lateral do embed agora é aplicada corretamente via `border-left` no wrapper.
3.  **Renderização de Imagens:**
    *   **Painel (`script.js`):** A função `updatePreview` agora verifica se a URL da imagem/thumbnail é válida (começa com `http` ou `data:image`) antes de tentar carregar, evitando erros de console e garantindo que apenas URLs válidas sejam exibidas.
4.  **Renderização de Campos Inline:**
    *   **Painel (`script.js`):** A lógica de renderização de campos no `updatePreview` foi corrigida para aplicar o estilo `inline` corretamente, usando `grid-column: span 1;` para campos inline e `grid-column: 1 / -1;` para campos não-inline.
5.  **Variáveis de Template no Preview:**
    *   **Painel (`script.js`):** A função `renderDiscordText` agora simula a substituição das variáveis de template (`{server.name}`, `{server.members}`, etc.) para que o usuário veja o resultado final no preview.

## 5. Próximos Passos (Sugestões de Melhoria)

*   **Validação de URL:** Implementar uma validação mais robusta para URLs de imagens e botões no painel.
*   **Melhoria na UX do Agendamento Fixo:** O campo `fixed_times` aceita uma string de horários separados por vírgula. Seria ideal ter um componente de UI que permita adicionar/remover horários de forma mais intuitiva.
*   **Logs no Painel:** O bot envia logs para o nó `logs/{ann_id}`. O painel pode ser aprimorado para ler esses logs e exibir o status de envio de cada anúncio de forma mais detalhada.
*   **Sincronização de Membros:** O bot sincroniza os 100 primeiros membros para camuflagem. O painel pode usar esses dados para um seletor de usuário mais amigável.
