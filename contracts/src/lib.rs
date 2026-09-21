#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, Env, String,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Balance(Address),
}

const TTL_THRESHOLD: u32 = 100;
const TTL_EXTEND_TO: u32 = 518_400;

#[contract]
pub struct SendaContract;

fn require_admin(env: &Env) -> Result<Address, Error> {
    let admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(Error::NotInitialized)?;
    admin.require_auth();
    Ok(admin)
}

#[contractimpl]
impl SendaContract {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn ping(env: Env) -> String {
        String::from_str(&env, "senda")
    }

    pub fn admin(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    pub fn credit(env: Env, user: Address, amount: i128) -> Result<i128, Error> {
        require_admin(&env)?;

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let key = DataKey::Balance(user);
        let current: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        let new_balance = current.checked_add(amount).ok_or(Error::InvalidAmount)?;

        env.storage().persistent().set(&key, &new_balance);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        Ok(new_balance)
    }

    pub fn balance(env: Env, user: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(user))
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    #[test]
    fn ping_returns_senda() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let contract_id = env.register(SendaContract, (admin.clone(),));
        let client = SendaContractClient::new(&env, &contract_id);

        assert_eq!(client.ping(), String::from_str(&env, "senda"));
        assert_eq!(client.admin(), admin);
    }

    #[test]
    fn credit_updates_balance() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let contract_id = env.register(SendaContract, (admin,));
        let client = SendaContractClient::new(&env, &contract_id);

        assert_eq!(client.balance(&user), 0);
        assert_eq!(client.credit(&user, &1_000), 1_000);
        assert_eq!(client.credit(&user, &250), 1_250);
        assert_eq!(client.balance(&user), 1_250);
    }
}
