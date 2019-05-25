import React from 'react';
import UserThreadsItem from '../user-threads-item';
import { getDefaultImageUrl, getUserAvatar} from '../../services';
import { getDateInfoForThread } from '../../helpers';
import './user-threads.css';

const UserThreads = (props) => {
        
        const {threads, threadId, profile} = props;
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
            const youPrefix = thread.lastMessage.senderId === profile.id ? `You: ${thread.lastMessage.text}` : thread.lastMessage.text
            const lasteMessage = thread.lastMessage ? youPrefix : 'No messages';
            const typingOrLM = thread.oponentVM.isTyping ? 'Typing...' : lasteMessage;
            const { oponentVM } = thread; 
            const imagePath = oponentVM.avatarFileName === null ? getDefaultImageUrl(oponentVM.username) : getUserAvatar(oponentVM.avatarFileName);
           
            const lastMessageTime = lasteMessage !== 'No messages' ? getDateInfoForThread(thread.lastMessage.time) : '';
            const { isOnline } = thread.oponentVM;
            const classStatus = isOnline ? 'online' : '';
            return(
                <li key={thread.id} className={"clearfix " + active} onClick={() => {props.subscribeToThread(thread.id, oponentVM);}}>
                    <UserThreadsItem
                        oponentVM={oponentVM}
                        imagePath={imagePath}
                        classStatus={classStatus}
                        typingOrLM={typingOrLM}
                        lastMessageTime={lastMessageTime}/>
                 </li>
                 );
            
        });
        return items;
    
};

export default UserThreads;