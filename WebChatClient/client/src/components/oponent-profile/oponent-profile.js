import React, { Component } from 'react';
import './oponent-profile.css';
import { withAuth } from '../hoc';
import Axios from 'axios';

 class OponentProfile extends Component {
    state = {
        profile: null
    }

    componentDidMount(){
        Axios.get('')
    }
    render(){
        return(
            <div className="oponent-profile">
                <img src="http://emilcarlsson.se/assets/harveyspecter.png" alt=""/>
                <p>{this.props.name}</p>
            </div>
            );
    };
};

export default withAuth(OponentProfile);