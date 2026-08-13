using System.Threading.Tasks;
using WebChat.Models.ViewModels;

namespace WebChat.Services
{
    /// <summary>
    /// The admin console's Overview: how the workspace is doing, in numbers that are counted
    /// rather than asserted.
    /// </summary>
    public interface IOverviewService
    {
        Task<AdminOverviewViewModel> GetAsync();
    }
}
