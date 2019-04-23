import React, {Component } from 'react';
import Dashboard from './Dashboard';


export default class AuthenticatedComponent extends Component {
    state = {
        user: undefined
    };

    componentDidMount(){
        
    }
   render(){
       
       return (
           
           <div>{this.props.children}</div>
       );
   }
};