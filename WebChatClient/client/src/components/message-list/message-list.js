import React from 'react'
import Message from '../message';
import OponentProfile from '../oponent-profile';
import MessageHistorySearch from '../message-history-search';
import { getDateInfoForMessage } from '../../helpers/';//Formating DateTime Today, Yesterday, Up to 6 days ago, Week Ago and if more showing date
import './message-list.css';
import { withAuth } from '../hoc';
import { getMessages } from '../../services';

class MessageList extends React.Component {
 
    state ={
        threadId: null,
        userProfile: null, 
        oponentProfile: null,
        messages:[],
        isSearch: false,
        search: ''
    };

    componentDidMount(){
        this.props.connection.on('ReciveMessage', message => {
            if(message.threadId !== this.state.threadId){
                return;
            };
            let { messages } = this.state;
            messages = [...messages, message];
            this.setState({messages});
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
    
    componentDidUpdate(prevProps) {
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
    };
    searchMessages = (messages, search) => {
        if(search.length === 0){
            return messages;
        }
        return messages.filter(msg => {
            return msg.text.toLowerCase().indexOf(search.toLowerCase()) > -1
        });
    }

    render() {
        const { messages, oponentProfile, threadId, isSearch, search } = this.state;
        const chooseOpponent = (<div className="join-room">&larr; Chose Opponent</div>);
        const noMessages = (<div className="join-room">You Still have no messages - begin chatting</div>);
        
        const messagesMap =  this.searchMessages(messages, search).map(({ username, text, time, id }, index) => {
            var myDate = getDateInfoForMessage(time);
            
            return (
                <Message key={id} username={username} text={text} time={myDate} curentUsername={this.props.username} />
            )
        });
        
        const content = messages.length < 1 ? noMessages : messagesMap;
        const contentToDisplay = !threadId ? chooseOpponent : content;
        //
        const oponentProfileVsSeach = !isSearch ? 
            <OponentProfile profile={oponentProfile} handleSearchbar={this.handleSearchbar}/>
        : <MessageHistorySearch handleSearchbar={this.handleSearchbar} profile={oponentProfile} onSearchChange={this.onSearchChange}/>
        
        return (
            <React.Fragment>
                    {oponentProfileVsSeach}
                    <ul className="message-list" ref="messages">
                        {contentToDisplay}
                    </ul>
            </React.Fragment>

        )
    }
}

export default withAuth(MessageList);