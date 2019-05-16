import React, { Component } from 'react'
import './send-message-form.css';

class SendMessageForm extends Component {
    
    constructor() {
        super()
        this.state = {
            message: ''
        }
        this.handleChange = this.handleChange.bind(this)
        this.handleSubmit = this.handleSubmit.bind(this)
    }
    
    handleChange(e) {
        this.setState({
            message: e.target.value
        })
        this.props.typing(e.target);
    }
    
    handleSubmit(e) {
        e.preventDefault();
        const target = e.target.querySelector('input');
        this.props.sendMessage(this.state.message);
        this.setState({
            message: ''
        })
        target.value = '';
        this.props.typing(target);
    }
    
    render() {
        return (
            <form
                onSubmit={this.handleSubmit}
                className="send-message-form">
                <input
                    // disabled={this.props.disabled}
                    onChange={this.handleChange}
                    value={this.state.message}
                    placeholder="Type your message and hit ENTER"
                    type="text"
                    name={this.props.threadId} />
                    
                    <button type="submit" className="submit">
                        <i className="material-icons md-36">send</i>
                    </button>
            </form>
        )
    }
}

export default SendMessageForm