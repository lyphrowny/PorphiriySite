   import React, { useState, useEffect, useRef } from 'react';
   import './App.css';
   import './TabStyles.css';
   import './ChatStyles.css';

   function App() {
     const [message, setMessage] = useState('');
     const [selectedModel, setSelectedModel] = useState('gpt-3.5-turbo');
     const [selectedAssistant, setSelectedAssistant] = useState(0);
     const [loading, setLoading] = useState(false);
     const [chatHistories, setChatHistories] = useState([[], [], [], [], []]);
     const [assistants, setAssistants] = useState([]);
     const currentMessageRef = useRef('');
     const wsRef = useRef(null);

     useEffect(() => {
       fetch("http://localhost:8000/assistants/")
         .then(response => response.json())
         .then(data => {
           if (data && data.length > 0) {
             setAssistants(data);
             const initialHistories = data.map(() => []);
             setChatHistories(initialHistories);
           }
         });
     }, []);

     useEffect(() => {
       if (assistants.length > 0) {
         assistants.forEach((assistant, index) => {
           fetch(`http://localhost:8000/assistants/${assistant.id}/history/`)
             .then(response => response.json())
             .then(history => {
               setChatHistories(prevHistories => {
                 const newHistories = [...prevHistories];
                 newHistories[index] = history.map(item => ({ role: item.role, content: item.content }));
                 return newHistories;
               });
             });
         });
       }
     }, [assistants]);

     const models = [
       'gpt-3.5-turbo',
       'gpt-4',
       'gpt-3.5-turbo-16k',
       'davinci',
       'curie'
     ];

     const handleSubmit = async (e) => {
       e.preventDefault();
       setLoading(true);
       currentMessageRef.current = '';

       const ws = new WebSocket('ws://localhost:8000/ws/chat/');
       wsRef.current = ws;

       ws.onopen = () => {
         ws.send(JSON.stringify({
           message: message,
           model: selectedModel,
           assistant_id: assistants[selectedAssistant].id
         }));
       };

       ws.onmessage = (event) => {
         const newMessage = event.data;
         currentMessageRef.current += newMessage;
         setChatHistories((prevHistories) => {
           const newHistories = [...prevHistories];
           const lastIndex = newHistories[selectedAssistant].length - 1;

           if (newHistories[selectedAssistant][lastIndex]?.role === 'assistant') {
             newHistories[selectedAssistant][lastIndex].content = currentMessageRef.current;
           } else {
             newHistories[selectedAssistant] = [
               ...newHistories[selectedAssistant],
               { role: 'assistant', content: currentMessageRef.current }
             ];
           }

           return newHistories;
         });
       };

       ws.onerror = (error) => {
         setChatHistories((prevHistories) => {
           const newHistories = [...prevHistories];
           newHistories[selectedAssistant] = [
             ...newHistories[selectedAssistant],
             { role: 'error', content: 'Ошибка при получении ответа от сервера' }
           ];
           return newHistories;
         });
         console.error('WebSocket error:', error);
       };

       ws.onclose = () => {
         if (currentMessageRef.current) {
           setChatHistories((prevHistories) => {
             const newHistories = [...prevHistories];
             const lastIndex = newHistories[selectedAssistant].length - 1;

             if (newHistories[selectedAssistant][lastIndex]?.role === 'assistant') {
               newHistories[selectedAssistant][lastIndex].content = currentMessageRef.current;
             } else {
               newHistories[selectedAssistant] = [
                 ...newHistories[selectedAssistant],
                 { role: 'assistant', content: currentMessageRef.current }
               ];
             }

             return newHistories;
           });
         }
         setLoading(false);
       };

       setChatHistories((prevHistories) => {
         const newHistories = [...prevHistories];
         newHistories[selectedAssistant] = [
           ...newHistories[selectedAssistant],
           { role: 'user', content: message }
         ];
         return newHistories;
       });
       setMessage('');
     };

     useEffect(() => {
       return () => {
         if (wsRef.current) {
           wsRef.current.close();
         }
       };
     }, []);

     return (
       <div className="App">
         <header className="App-header">
           <h1>Общайтесь с экспертами на любые темы — ChatGPT с FastAPI и React</h1>
           <div className="tab-container">
             {assistants.length > 0 ? assistants.map((assistant, index) => (
               <button
                 key={index}
                 className={`tab-button ${selectedAssistant === index ? 'active' : ''}`}
                 onClick={() => setSelectedAssistant(index)}
               >
                 <img src={assistant.avatar_url} alt={`Avatar of ${assistant.name}`} className="avatar-placeholder" />
                 {assistant.name}
               </button>
             )) : <p>Загрузка ассистентов...</p>}
           </div>
           <form onSubmit={handleSubmit}>
             <select
               value={selectedModel}
               onChange={(e) => setSelectedModel(e.target.value)}
             >
               {models.map((model) => (
                 <option key={model} value={model}>
                   {model}
                 </option>
               ))}
             </select>
             <textarea
               rows="4"
               value={message}
               onChange={(e) => setMessage(e.target.value)}
               placeholder="Введите ваше сообщение..."
             />
             <button type="submit" disabled={loading}>
               {loading ? 'Отправка...' : 'Отправить'}
             </button>
           </form>
           <div className="chat-history">
             {chatHistories[selectedAssistant]?.map((chat, index) => (
               <div key={index} className={`chat-message ${chat.role} ${loading && chat.role === 'assistant' ? 'typing' : ''}`}>
                 {chat.role === 'assistant' && (
                   <img
                     src={assistants[selectedAssistant]?.avatar_url}
                     alt={`Avatar of ${assistants[selectedAssistant]?.name}`}
                     className="response-avatar"
                   />
                 )}
                 <div className="response-content">
                   <p>{chat.content}</p>
                 </div>
               </div>
             ))}
           </div>
         </header>
       </div>
     );
   }

   export default App;