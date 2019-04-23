import React, {Component } from 'react';
import Axios from 'axios';
import { withAuth } from './hoc';

class Dashboard extends Component  {

    state = {
        message: null
    }
    componentDidMount(){
        console.log(this.props.user);

        const {token} = this.props.user;
        
        Axios.get('http://localhost:5000/api/hey/get', {
            headers: {'Authorization': `Bearer ${token}`},
        }).then(res => this.setState({message: res.data.message}))
        .catch(err => {
            if(err.response.status === 401){
                this.props.history.push("/login");
            }
        });
    };

  render(){
    return(
        <div>{this.state.message}</div>
    );
  };
};

export default withAuth(Dashboard);