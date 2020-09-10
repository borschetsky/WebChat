import React from 'react'
import Message from '../message';
import OponentProfile from '../oponent-profile';
import MessageHistorySearch from '../message-history-search';
import { getDateInfoForMessage, getDateInfoForSeparator } from '../../helpers/';//Formating DateTime Today, Yesterday, Up to 6 days ago, Week Ago and if more showing date
import './message-list.css';
import { withAuth } from '../hoc';
import { getMessages, searchForMessageInThread } from '../../services';

class MessageList extends React.Component {
 
    state ={
        threadId: null,
        userProfile: null, 
        oponentProfile: null,
        messages:{},
        isSearch: false,
        search: '',
        searchResult: {}
    };

    componentDidMount(){
        this.props.connection.on('ReciveMessage', message => {
            if(message.threadId !== this.state.threadId){
                return;
            };
            let { messages } = this.state;
            let messageKey = message.date.slice(0, message.date.length - 6);
            if(messages.hasOwnProperty(messageKey)){
                messages[messageKey] = [...messages[messageKey], message];
            }else{
                messages[messageKey] = [message];
            };
            this.setState({messages: messages});
        });
        this.setState({
            threadId: this.props.threadId, 
            userProfile: this.props.userProfile,
            oponentProfile: this.props.oponentProfile
        });
    }

    componentWillUpdate() {
        const node = this.refs.messages;
        this.shouldScrollToBottom = node.scrollTop + node.clientHeight + 100 >= node.scrollHeight;
    }
    
    componentDidUpdate(prevProps, prevState) {
        if (this.shouldScrollToBottom) {
            const node = this.refs.messages;
            node.scrollTop = node.scrollHeight   
        }
        if(prevProps.threadId !== this.props.threadId){
           
            this.setState({
                threadId: this.props.threadId,
                isSearch: false,
                search: ''
            });
            this.getMessagesForThread(this.props.threadId);
        }
        if(prevProps.oponentProfile !== this.props.oponentProfile){
            this.setState({oponentProfile: this.props.oponentProfile})
        }
        if(prevProps.userProfile !== this.props.userProfile){
            this.setState({userProfile: this.props.userProfile})
        }
        if(prevState.messages !== this.state.messages){
            this.setState({messages: this.state.messages});
        }

    }

    getMessagesForThread = (threadId) => {
        const {token} = this.props.user;
            this.setState({messages: []});
            getMessages(threadId, token).then(res => {
                this.setState({messages: res.data});
                
            }).catch(err => console.log(err));
    };

    handleSearchbar = () => {
        this.setState({isSearch: !this.state.isSearch, search: ''});
        
    };
    onSearchChange = (search) => {
        this.setState({search});
        if(search.length > 0){
            this.searchMessages(search);
        }
    };
    searchMessages = (search) => {
        const { token } = this.props.user;
        const {threadId } = this.state;
        const params = {
            term: search,
            threadid: threadId
        };

       searchForMessageInThread(token, params).then(res => {
            this.setState({searchResult: res.data})
        }).catch(err => console.log(err));
        
    }
    mapMessages = (messages) => {
        return Object.keys(messages).map((item, index) => {
            const dateMessages = messages[item].map(({ username, text, time, id, senderId }) => {
                var myDate = getDateInfoForMessage(time);
                
                return(
                    <Message key={id} 
                             username={username} 
                             text={text} 
                             time={myDate} 
                             curentUsername={this.props.username}
                             senderId={senderId}
                             profile={this.state.userProfile}
                             opponentProfile={this.state.oponentProfile} />
                );
            });
            const sepDate = getDateInfoForSeparator(item);
            return(
                <React.Fragment key={`${item}${item}`}>
                    <li key={item} className="message-date-separator">{sepDate}</li>
                    {dateMessages}
                </React.Fragment>
                
            );
        });
    }

    render() {
        const { messages, oponentProfile, threadId, isSearch, search, searchResult } = this.state;
        const chooseOpponent = (<div className="join-room">&larr; Chose Opponent</div>);
        const noMessages = (<div className="join-room">You Still have no messages - begin chatting</div>);
        const noMessagesFound = (<div className="join-room">No messages matched your search</div>);
       
        const messagesMap = (search.length > 0 && isSearch) ?  this.mapMessages(searchResult) : this.mapMessages(messages);
        //TODO: add check for messageMap Count if 0 say no such messages
        //      also implement message schroll uploading https://www.pubnub.com/tutorials/react/chat-message-history-and-infinite-scroll/#scroll-bottom
        const content = (Object.keys(messages).length < 1 && !isSearch) ? noMessages : messagesMap;
        
        const contentToDisplay = !threadId ? chooseOpponent : content;

        const contentVsSearchResults = (contentToDisplay.length < 1  && search.length > 0) ? noMessagesFound : contentToDisplay;
        
        const oponentProfileVsSeach = !isSearch ? 
            <OponentProfile profile={oponentProfile} handleSearchbar={this.handleSearchbar}/>
        : <MessageHistorySearch handleSearchbar={this.handleSearchbar} profile={oponentProfile} onSearchChange={this.onSearchChange}/>
        
        return (
            <React.Fragment>
                    {oponentProfileVsSeach}
                    <ul className="message-list" ref="messages">
                        {contentVsSearchResults}
                    </ul>
            </React.Fragment>

        )
    }
}

export default withAuth(MessageList);