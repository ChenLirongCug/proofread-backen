#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import psycopg2
import sys

# 硬编码配置
DB_HOST = 'localhost'
DB_PORT = 5432
DB_USER = 'proofread_user'
DB_PASSWORD = 'proofread123'
DB_NAME = 'proofread_db'
POSTGRES_PASSWORD = 'postgres'

def initialize():
    try:
        print("正在连接 PostgreSQL...")
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user='postgres',
            password=POSTGRES_PASSWORD,
            database='postgres'
        )
        conn.autocommit = True
        cursor = conn.cursor()
        print("✅ 已连接到 PostgreSQL")
        
        # 创建用户
        try:
            cursor.execute(f'CREATE USER "{DB_USER}" WITH PASSWORD \'{DB_PASSWORD}\';')
            print(f"✅ 用户 \'{DB_USER}\' 创建成功")
        except Exception as e:
            if 'already exists' in str(e):
                print(f"ℹ️  用户 \'{DB_USER}\' 已存在")
        
        # 创建数据库
        try:
            cursor.execute(f'CREATE DATABASE "{DB_NAME}" OWNER "{DB_USER}";')
            print(f"✅ 数据库 \'{DB_NAME}\' 创建成功")
        except Exception as e:
            if 'already exists' in str(e):
                print(f"ℹ️  数据库 \'{DB_NAME}\' 已存在")
        
        cursor.close()
        conn.close()
        
        # 连接到新数据库并创建表
        print("正在创建表结构...")
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
        cursor = conn.cursor()
        
        # 读取 SQL 初始化脚本
        with open('init-db.sql', 'r', encoding='utf-8') as f:
            sql_file = f.read()
        
        # 分割并执行 SQL 语句
        for statement in sql_file.split(';'):
            statement = statement.strip()
            if statement and not statement.startswith('--') and not statement.startswith('\\\\'):
                try:
                    cursor.execute(statement)
                except Exception as e:
                    if 'exists' not in str(e).lower():
                        print(f"⚠️  错误: {str(e)[:100]}")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print("✅ 数据库初始化完成！")
        return True
        
    except Exception as e:
        print(f"❌ 初始化失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    if not initialize():
        sys.exit(1)
