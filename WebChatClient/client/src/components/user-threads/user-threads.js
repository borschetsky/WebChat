import React from 'react';


const UserThreads = (props) => {
    
        const {threads, threadId, userId} = props;
        if(threads.length === 0){
            return <h4>Yo still have no threads</h4>;
        };
        threads.sort(function(a, b){
            return new Date(b.lastMessage.time).getTime() - new Date(a.lastMessage.time).getTime()
        });
        const items = threads.map(thread => {
           
            let userNameToDisplay = '';
            let oponetId = '';
            if (thread.owner === userId){
                userNameToDisplay = thread.oponentName;
                oponetId = thread.oponent;  
            }
            if(thread.oponent === userId){
                userNameToDisplay = thread.ownerName;
                oponetId = thread.owner;
            };
            const imageLink = `https://ui-avatars.com/api/?name=${userNameToDisplay}&rounded=true&bold=true&size=128`;
            const active = thread.id === threadId ? 'active' : '';
            const lasteMessage = thread.lastMessage ? thread.lastMessage.text : 'No messages';
            console.log(oponetId);
            return(
                <li key={thread.id} className={"clearfix " + active} onClick={() => {
                    props.subscribeToThread(thread.id, oponetId);
                    
                    }}>
                    <div className="clearfix-wrapper" >
                        <img src={imageLink} alt="avatar"/>
                        <div className="about">
                            <p className="name">{userNameToDisplay}</p>
                            <p className="status">
                                {lasteMessage}
                            </p>
                        </div>
                    </div>
                 </li>
                 );
            
        });
        return items;
    
};

export default UserThreads;