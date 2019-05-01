import React, { Component } from 'react';

const withAuth = (Wrapped) => {
    return class extends Component {
        state = {
            user: null
        };

        componentDidMount(){
            const user = JSON.parse(localStorage.getItem('user-data'));
            if(!user){
                this.props.history.push('/Login');
            }
            this.update(user);
            
            
        };

        update = (user) => {
            this.setState({
                user: user
            });
        };

        render(){
            const {user} = this.state;

            if(!user){
                return (<div>Loading</div>);
            };

            return <Wrapped {...this.props} user={this.state.user}/>
        };
    };
};

export default withAuth;