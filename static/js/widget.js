(function() {
    // Configuration - automatically detect the API URL
    const CONFIG = {
        apiUrl: window.location.origin + '/api/chat/proxy',
        position: 'bottom-right',
        primaryColor: '#4f46e5'
    };

    // Create widget HTML
    const widgetHTML = `
        <div class="chat-widget-container">
            <button class="chat-widget-button" id="chatWidgetButton">
                Chat
            </button>
            <div class="chat-widget-window" id="chatWidgetWindow">
                <div class="chat-widget-header">
                    <h3>Chat Assistant</h3>
                    <button class="chat-widget-close" id="chatWidgetClose">&times;</button>
                </div>
                <div class="chat-widget-messages" id="chatWidgetMessages">
                    <div class="chat-message bot">
                        <div class="chat-message-content">
                            Hi! How can I help you today?
                        </div>
                    </div>
                </div>
                <div class="chat-widget-input-area">
                    <input 
                        type="text" 
                        class="chat-widget-input" 
                        id="chatWidgetInput"
                        placeholder="Type your message..."
                    />
                    <button class="chat-widget-send" id="chatWidgetSend">Send</button>
                </div>
            </div>
        </div>
    `;

    // Insert widget into page
    document.addEventListener('DOMContentLoaded', function() {
        document.body.insertAdjacentHTML('beforeend', widgetHTML);
        initWidget();
    });

    function initWidget() {
        const button = document.getElementById('chatWidgetButton');
        const window = document.getElementById('chatWidgetWindow');
        const closeBtn = document.getElementById('chatWidgetClose');
        const input = document.getElementById('chatWidgetInput');
        const sendBtn = document.getElementById('chatWidgetSend');
        const messagesContainer = document.getElementById('chatWidgetMessages');

        // Toggle widget
        button.addEventListener('click', () => {
            window.classList.toggle('open');
            if (window.classList.contains('open')) {
                input.focus();
            }
        });

        closeBtn.addEventListener('click', () => {
            window.classList.remove('open');
        });

        // Send message
        async function sendMessage() {
            const message = input.value.trim();
            if (!message) return;

            // Add user message
            addMessage(message, 'user');
            input.value = '';
            sendBtn.disabled = true;

            // Show typing indicator
            const typingId = addTypingIndicator();

            try {
                const response = await fetch(CONFIG.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ question: message })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                
                // Remove typing indicator
                removeTypingIndicator(typingId);
                
                // Add bot response
                addMessage(data.answer || data.response || 'Sorry, I could not process your request.', 'bot');
            } catch (error) {
                console.error('Chat error:', error);
                removeTypingIndicator(typingId);
                addMessage('Sorry, there was an error processing your request. Please try again.', 'bot');
            } finally {
                sendBtn.disabled = false;
                input.focus();
            }
        }

        sendBtn.addEventListener('click', sendMessage);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        function addMessage(text, type) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `chat-message ${type}`;
            messageDiv.innerHTML = `
                <div class="chat-message-content">${escapeHtml(text)}</div>
            `;
            messagesContainer.appendChild(messageDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        function addTypingIndicator() {
            const typingDiv = document.createElement('div');
            typingDiv.className = 'chat-message bot';
            typingDiv.id = 'typing-indicator-' + Date.now();
            typingDiv.innerHTML = `
                <div class="chat-message-content typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            `;
            messagesContainer.appendChild(typingDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            return typingDiv.id;
        }

        function removeTypingIndicator(id) {
            const indicator = document.getElementById(id);
            if (indicator) {
                indicator.remove();
            }
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    }
})();
