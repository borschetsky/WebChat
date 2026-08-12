---
title: EntityFrameworkServiceCollectionExtensions.ConfigureDbContext Method (Microsoft.Extensions.DependencyInjection)
source-url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.dependencyinjection.entityframeworkservicecollectionextensions.configuredbcontext?view=efcore-10.0
applies-to-version: efcore-10.0
upstream-repo-url: https://github.com/dotnet/EntityFramework.ApiDocs/blob/live/dotnet/xml/Microsoft.Extensions.DependencyInjection/EntityFrameworkServiceCollectionExtensions.xml
upstream-commit: a39622baf9b6785a78a566f0e97f4042086f8ae4
learn-page-updated: 2025-11-21
fetched-on: 2026-08-12
learn-default-moniker: efcore-10.0
learn-all-monikers: efcore-9.0 efcore-10.0
learn-uid: Microsoft.Extensions.DependencyInjection.EntityFrameworkServiceCollectionExtensions.ConfigureDbContext*
vendored-by: scripts/vendor-learn-page.sh
transform: |
  Fetched with 'Accept: text/markdown', so Learn had already inlined the
  ':::code source=' samples, the '[!INCLUDE]' files and the '<xref:>' links.
  Dropped whole '::: moniker' blocks not naming efcore-10.0 (154 -> 151 lines).
  Absolutised root-relative links to learn.microsoft.com. No prose was rewritten.
---

# EntityFrameworkServiceCollectionExtensions.ConfigureDbContext Method

## Definition

- Namespace:
    - [Microsoft.Extensions.DependencyInjection](microsoft.extensions.dependencyinjection)

- Assembly:
    - Microsoft.EntityFrameworkCore.dll

- Package:
    - Microsoft.EntityFrameworkCore v10.0.0

- Package:
    - Microsoft.EntityFrameworkCore v9.0.0

## Overloads

| Name | Description |
| --- | --- |
| [ConfigureDbContext&lt;TContext&gt;(IServiceCollection, Action&lt;DbContextOptionsBuilder&gt;, ServiceLifetime)](microsoft.extensions.dependencyinjection.entityframeworkservicecollectionextensions.configuredbcontext#microsoft-extensions-dependencyinjection-entityframeworkservicecollectionextensions-configuredbcontext-1%28microsoft-extensions-dependencyinjection-iservicecollection-system-action%28%28microsoft-entityframeworkcore-dbcontextoptionsbuilder%29%29-microsoft-extensions-dependencyinjection-servicelifetime%29) | Configures the given context type in the [IServiceCollection](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.dependencyinjection.iservicecollection). |
| [ConfigureDbContext&lt;TContext&gt;(IServiceCollection, Action&lt;IServiceProvider,DbContextOptionsBuilder&gt;, ServiceLifetime)](microsoft.extensions.dependencyinjection.entityframeworkservicecollectionextensions.configuredbcontext#microsoft-extensions-dependencyinjection-entityframeworkservicecollectionextensions-configuredbcontext-1%28microsoft-extensions-dependencyinjection-iservicecollection-system-action%28%28system-iserviceprovider-microsoft-entityframeworkcore-dbcontextoptionsbuilder%29%29-microsoft-extensions-dependencyinjection-servicelifetime%29) | Configures the given context type in the [IServiceCollection](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.dependencyinjection.iservicecollection). |


## ConfigureDbContext&lt;TContext&gt;(IServiceCollection, Action&lt;DbContextOptionsBuilder&gt;, ServiceLifetime)

- Source:
    - [EntityFrameworkServiceCollectionExtensions.cs](https://github.com/dotnet/dotnet/blob/b0f34d51fccc69fd334253924abd8d6853fad7aa/src/efcore/src/EFCore/Extensions/EntityFrameworkServiceCollectionExtensions.cs#L1065C12-L1065C104)

- Source:
    - [EntityFrameworkServiceCollectionExtensions.cs](https://github.com/dotnet/efcore/blob/645f3131a5b0a4bf677201cf22773990a5316c89/src/EFCore/Extensions/EntityFrameworkServiceCollectionExtensions.cs#L1072C12-L1072C104)

Configures the given context type in the [IServiceCollection](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.dependencyinjection.iservicecollection).

```csharp
public static Microsoft.Extensions.DependencyInjection.IServiceCollection ConfigureDbContext<TContext>(this Microsoft.Extensions.DependencyInjection.IServiceCollection serviceCollection, Action<Microsoft.EntityFrameworkCore.DbContextOptionsBuilder> optionsAction, Microsoft.Extensions.DependencyInjection.ServiceLifetime optionsLifetime = Microsoft.Extensions.DependencyInjection.ServiceLifetime.Singleton) where TContext : Microsoft.EntityFrameworkCore.DbContext;
```

```fsharp
static member ConfigureDbContext : Microsoft.Extensions.DependencyInjection.IServiceCollection * Action<Microsoft.EntityFrameworkCore.DbContextOptionsBuilder> * Microsoft.Extensions.DependencyInjection.ServiceLifetime -> Microsoft.Extensions.DependencyInjection.IServiceCollection (requires 'Context :> Microsoft.EntityFrameworkCore.DbContext)
```

```vb
<Extension()>
Public Function ConfigureDbContext(Of TContext As DbContext) (serviceCollection As IServiceCollection, optionsAction As Action(Of DbContextOptionsBuilder), Optional optionsLifetime As ServiceLifetime = Microsoft.Extensions.DependencyInjection.ServiceLifetime.Singleton) As IServiceCollection
```

#### Type Parameters

- TContext

The type of context to be registered.

#### Parameters

- serviceCollection
    - [IServiceCollection](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.dependencyinjection.iservicecollection)

The [IServiceCollection](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.dependencyinjection.iservicecollection) to add services to.

- optionsAction
    - [Action](https://learn.microsoft.com/en-us/dotnet/api/system.action-1)&lt;[DbContextOptionsBuilder](microsoft.entityframeworkcore.dbcontextoptionsbuilder)&gt;

An action to configure the [DbContextOptions](microsoft.entityframeworkcore.dbcontextoptions) for the context.

- optionsLifetime
    - [ServiceLifetime](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.dependencyinjection.servicelifetime)

The lifetime with which the [DbContextOptions](microsoft.entityframeworkcore.dbcontextoptions) service will be registered in the container.

#### Returns

[IServiceCollection](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.dependencyinjection.iservicecollection)

The same service collection so that multiple calls can be chained.

### Remarks

[AddDbContext&lt;TContext&gt;(IServiceCollection, Action&lt;DbContextOptionsBuilder&gt;, ServiceLifetime, ServiceLifetime)](microsoft.extensions.dependencyinjection.entityframeworkservicecollectionextensions.adddbcontext#microsoft-extensions-dependencyinjection-entityframeworkservicecollectionextensions-adddbcontext-1%28microsoft-extensions-dependencyinjection-iservicecollection-system-action%28%28microsoft-entityframeworkcore-dbcontextoptionsbuilder%29%29-microsoft-extensions-dependencyinjection-servicelifetime-microsoft-extensions-dependencyinjection-servicelifetime%29), [AddDbContextPool&lt;TContext&gt;(IServiceCollection, Action&lt;DbContextOptionsBuilder&gt;, Int32)](microsoft.extensions.dependencyinjection.entityframeworkservicecollectionextensions.adddbcontextpool#microsoft-extensions-dependencyinjection-entityframeworkservicecollectionextensions-adddbcontextpool-1%28microsoft-extensions-dependencyinjection-iservicecollection-system-action%28%28microsoft-entityframeworkcore-dbcontextoptionsbuilder%29%29-system-int32%29), [AddDbContextFactory&lt;TContext,TFactory&gt;(IServiceCollection, Action&lt;DbContextOptionsBuilder&gt;, ServiceLifetime)](microsoft.extensions.dependencyinjection.entityframeworkservicecollectionextensions.adddbcontextfactory#microsoft-extensions-dependencyinjection-entityframeworkservicecollectionextensions-adddbcontextfactory-2%28microsoft-extensions-dependencyinjection-iservicecollection-system-action%28%28microsoft-entityframeworkcore-dbcontextoptionsbuilder%29%29-microsoft-extensions-dependencyinjection-servicelifetime%29) or [AddPooledDbContextFactory&lt;TContext&gt;(IServiceCollection, Action&lt;DbContextOptionsBuilder&gt;, Int32)](microsoft.extensions.dependencyinjection.entityframeworkservicecollectionextensions.addpooleddbcontextfactory#microsoft-extensions-dependencyinjection-entityframeworkservicecollectionextensions-addpooleddbcontextfactory-1%28microsoft-extensions-dependencyinjection-iservicecollection-system-action%28%28microsoft-entityframeworkcore-dbcontextoptionsbuilder%29%29-system-int32%29) must also be called for the specified configuration to take effect. Calling this method after any of the above will ovewrite conflicting configuration. For non-pooled contexts [OnConfiguring(DbContextOptionsBuilder)](microsoft.entityframeworkcore.dbcontext.onconfiguring#microsoft-entityframeworkcore-dbcontext-onconfiguring%28microsoft-entityframeworkcore-dbcontextoptionsbuilder%29) configuration will be applied in addition to configuration performed here.

This method can be invoked multiple times and the configuration will be applied in the given order.

See [Using DbContext with dependency injection](https://aka.ms/efcore-docs-di) for more information and examples.

### Applies to



## ConfigureDbContext&lt;TContext&gt;(IServiceCollection, Action&lt;IServiceProvider,DbContextOptionsBuilder&gt;, ServiceLifetime)

- Source:
    - [EntityFrameworkServiceCollectionExtensions.cs](https://github.com/dotnet/dotnet/blob/b0f34d51fccc69fd334253924abd8d6853fad7aa/src/efcore/src/EFCore/Extensions/EntityFrameworkServiceCollectionExtensions.cs#L1102C9-L1108C34)

- Source:
    - [EntityFrameworkServiceCollectionExtensions.cs](https://github.com/dotnet/efcore/blob/645f3131a5b0a4bf677201cf22773990a5316c89/src/EFCore/Extensions/EntityFrameworkServiceCollectionExtensions.cs#L1109C9-L1115C34)

Configures the given context type in the [IServiceCollection](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.dependencyinjection.iservicecollection).

```csharp
public static Microsoft.Extensions.DependencyInjection.IServiceCollection ConfigureDbContext<TContext>(this Microsoft.Extensions.DependencyInjection.IServiceCollection serviceCollection, Action<IServiceProvider,Microsoft.EntityFrameworkCore.DbContextOptionsBuilder> optionsAction, Microsoft.Extensions.DependencyInjection.ServiceLifetime optionsLifetime = Microsoft.Extensions.DependencyInjection.ServiceLifetime.Singleton) where TContext : Microsoft.EntityFrameworkCore.DbContext;
```

```fsharp
static member ConfigureDbContext : Microsoft.Extensions.DependencyInjection.IServiceCollection * Action<IServiceProvider, Microsoft.EntityFrameworkCore.DbContextOptionsBuilder> * Microsoft.Extensions.DependencyInjection.ServiceLifetime -> Microsoft.Extensions.DependencyInjection.IServiceCollection (requires 'Context :> Microsoft.EntityFrameworkCore.DbContext)
```

```vb
<Extension()>
Public Function ConfigureDbContext(Of TContext As DbContext) (serviceCollection As IServiceCollection, optionsAction As Action(Of IServiceProvider, DbContextOptionsBuilder), Optional optionsLifetime As ServiceLifetime = Microsoft.Extensions.DependencyInjection.ServiceLifetime.Singleton) As IServiceCollection
```

#### Type Parameters

- TContext

The type of context to be registered.

#### Parameters

- serviceCollection
    - [IServiceCollection](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.dependencyinjection.iservicecollection)

The [IServiceCollection](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.dependencyinjection.iservicecollection) to add services to.

- optionsAction
    - [Action](https://learn.microsoft.com/en-us/dotnet/api/system.action-2)&lt;[IServiceProvider](https://learn.microsoft.com/en-us/dotnet/api/system.iserviceprovider),[DbContextOptionsBuilder](microsoft.entityframeworkcore.dbcontextoptionsbuilder)&gt;

An action to configure the [DbContextOptions](microsoft.entityframeworkcore.dbcontextoptions) for the context.

- optionsLifetime
    - [ServiceLifetime](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.dependencyinjection.servicelifetime)

The lifetime with which the [DbContextOptions](microsoft.entityframeworkcore.dbcontextoptions) service will be registered in the container.

#### Returns

[IServiceCollection](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.dependencyinjection.iservicecollection)

The same service collection so that multiple calls can be chained.

### Remarks

[AddDbContext&lt;TContext&gt;(IServiceCollection, Action&lt;DbContextOptionsBuilder&gt;, ServiceLifetime, ServiceLifetime)](microsoft.extensions.dependencyinjection.entityframeworkservicecollectionextensions.adddbcontext#microsoft-extensions-dependencyinjection-entityframeworkservicecollectionextensions-adddbcontext-1%28microsoft-extensions-dependencyinjection-iservicecollection-system-action%28%28microsoft-entityframeworkcore-dbcontextoptionsbuilder%29%29-microsoft-extensions-dependencyinjection-servicelifetime-microsoft-extensions-dependencyinjection-servicelifetime%29), [AddDbContextPool&lt;TContext&gt;(IServiceCollection, Action&lt;DbContextOptionsBuilder&gt;, Int32)](microsoft.extensions.dependencyinjection.entityframeworkservicecollectionextensions.adddbcontextpool#microsoft-extensions-dependencyinjection-entityframeworkservicecollectionextensions-adddbcontextpool-1%28microsoft-extensions-dependencyinjection-iservicecollection-system-action%28%28microsoft-entityframeworkcore-dbcontextoptionsbuilder%29%29-system-int32%29), [AddDbContextFactory&lt;TContext,TFactory&gt;(IServiceCollection, Action&lt;DbContextOptionsBuilder&gt;, ServiceLifetime)](microsoft.extensions.dependencyinjection.entityframeworkservicecollectionextensions.adddbcontextfactory#microsoft-extensions-dependencyinjection-entityframeworkservicecollectionextensions-adddbcontextfactory-2%28microsoft-extensions-dependencyinjection-iservicecollection-system-action%28%28microsoft-entityframeworkcore-dbcontextoptionsbuilder%29%29-microsoft-extensions-dependencyinjection-servicelifetime%29) or [AddPooledDbContextFactory&lt;TContext&gt;(IServiceCollection, Action&lt;DbContextOptionsBuilder&gt;, Int32)](microsoft.extensions.dependencyinjection.entityframeworkservicecollectionextensions.addpooleddbcontextfactory#microsoft-extensions-dependencyinjection-entityframeworkservicecollectionextensions-addpooleddbcontextfactory-1%28microsoft-extensions-dependencyinjection-iservicecollection-system-action%28%28microsoft-entityframeworkcore-dbcontextoptionsbuilder%29%29-system-int32%29) must also be called for the specified configuration to take effect. Calling this method after any of the above will ovewrite conflicting configuration. For non-pooled contexts [OnConfiguring(DbContextOptionsBuilder)](microsoft.entityframeworkcore.dbcontext.onconfiguring#microsoft-entityframeworkcore-dbcontext-onconfiguring%28microsoft-entityframeworkcore-dbcontextoptionsbuilder%29) configuration will be applied in addition to configuration performed here.

This method can be invoked multiple times and the configuration will be applied in the given order.

See [Using DbContext with dependency injection](https://aka.ms/efcore-docs-di) for more information and examples.

### Applies to

