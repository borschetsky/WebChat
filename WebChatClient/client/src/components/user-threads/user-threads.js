import React from 'react';
import { getDefaultImageUrl, getUserAvatar, defaultimage } from '../../services';
import { getDateInfoForThread } from '../../helpers';
import './user-threads.css';

const UserThreads = (props) => {
    
        const {threads, threadId} = props;
        if(threads.length === 0){
            return <h4>Yo still have no threads</h4>;
        };
        //Sorting threads by last message time
        threads.sort(function(a, b){
            if(a.lastMessage === null && b.lastMessage !== null) return -1;
            if(a.lastMessage !== null && b.lastMessage === null) return 1;
            if(a.lastMessage === null && b.lastMessage === null) return 1;
            return new Date(b.lastMessage.time).getTime() - new Date(a.lastMessage.time).getTime()
        });
        

        const items = threads.map(thread => {
            const active = thread.id === threadId ? 'active' : '';
            const lasteMessage = thread.lastMessage ? thread.lastMessage.text : 'No messages';
            const typingOrLM = thread.oponentVM.isTyping ? 'Typing...' : lasteMessage;
            const { oponentVM } = thread; 
            const imagePath = oponentVM.avatarFileName === null ? getDefaultImageUrl(oponentVM.username) : getUserAvatar(oponentVM.avatarFileName);
           
            const lastMessageTime = lasteMessage !== 'No messages' ? getDateInfoForThread(thread.lastMessage.time) : '';
            const { isOnline } = thread.oponentVM;
            const classStatus = isOnline ? 'online' : '';
            //TODO: Create thread View Compoennt and extract to separate file
            return(
                <li key={thread.id} className={"clearfix " + active} onClick={() => {
                    props.subscribeToThread(thread.id, oponentVM);
                    
                    }}>
                    <div className="clearfix-wrapper" >
                        <img onError={defaultimage} src={imagePath} alt="avatar" name={oponentVM.username} className={`oponent ${classStatus}`}/>
                        <div className="about">
                            <p className="name">{oponentVM.username}</p>
                            <p className="status">
                                {typingOrLM}
                            </p>
                        </div>
                        <span><small>{lastMessageTime}</small></span>
                    </div>
                 </li>
                 );
            
        });
        return items;
    
};

export default UserThreads;